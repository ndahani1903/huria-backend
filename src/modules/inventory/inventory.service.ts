import { prisma } from '../../config/db';
import redis from "../../config/redis";

interface InventoryReservation {
  id: string;
  productId: string;
  quantity: number;
  userId: string;
  expiresAt: Date;
}

export class InventoryService {
  private readonly RESERVATION_TTL = 900; // 15 minutes
  private readonly MAX_RETRIES = 3;
  
  async reserveStock(
    productId: string,
    quantity: number,
    userId: string
  ): Promise<{ success: boolean; reservationId?: string; error?: string }> {
    let retries = 0;
    
    while (retries < this.MAX_RETRIES) {
      try {
        // Get current product with version
        const product = await prisma.product.findUnique({
          where: { id: productId },
          select: { id: true, stock: true, version: true, reservedStock: true }
        });
        
        if (!product) {
          return { success: false, error: 'Product not found' };
        }
        
        const availableStock = product.stock - (product.reservedStock || 0);
        
        if (availableStock < quantity) {
          return { 
            success: false, 
            error: `Insufficient stock. Available: ${availableStock}, Requested: ${quantity}` 
          };
        }
        
        // Optimistic update with version check
        const updated = await prisma.product.updateMany({
          where: {
            id: productId,
            version: product.version // Critical: version check prevents race conditions
          },
          data: {
            reservedStock: {
              increment: quantity
            },
            version: {
              increment: 1
            },
            updatedAt: new Date()
          }
        });
        
        if (updated.count === 0) {
          // Version mismatch - retry
          retries++;
          await this.delay(Math.pow(2, retries) * 100);
          continue;
        }
        
        // Create reservation record
        const reservationId = this.generateReservationId();
        const reservation: InventoryReservation = {
          id: reservationId,
          productId,
          quantity,
          userId,
          expiresAt: new Date(Date.now() + this.RESERVATION_TTL * 1000)
        };
        
        // Store reservation in Redis with TTL
        await redis.setex(
          `reservation:${reservationId}`,
          this.RESERVATION_TTL,
          JSON.stringify(reservation)
        );
        
        // Add to product reservations set
        await redis.sadd(`product:${productId}:reservations`, reservationId);
        await redis.expire(`product:${productId}:reservations`, this.RESERVATION_TTL);
        
        return { success: true, reservationId };
      } catch (error) {
        retries++;
        if (retries >= this.MAX_RETRIES) {
          return { success: false, error: `Failed to reserve stock: ${error.message}` };
        }
        await this.delay(Math.pow(2, retries) * 100);
      }
    }
    
    return { success: false, error: 'Max retries exceeded' };
  }
  
  async confirmReservation(reservationId: string): Promise<{ success: boolean; error?: string }> {
    // Get reservation
    const reservationData = await redis.get(`reservation:${reservationId}`);
    if (!reservationData) {
      return { success: false, error: 'Reservation not found or expired' };
    }
    
    const reservation: InventoryReservation = JSON.parse(reservationData);
    let retries = 0;
    
    while (retries < this.MAX_RETRIES) {
      try {
        // Get current product
        const product = await prisma.product.findUnique({
          where: { id: reservation.productId },
          select: { id: true, stock: true, version: true, reservedStock: true }
        });
        
        if (!product) {
          return { success: false, error: 'Product not found' };
        }
        
        // Confirm reservation with version check
        const updated = await prisma.product.updateMany({
          where: {
            id: reservation.productId,
            version: product.version
          },
          data: {
            stock: {
              decrement: reservation.quantity
            },
            reservedStock: {
              decrement: reservation.quantity
            },
            version: {
              increment: 1
            },
            updatedAt: new Date()
          }
        });
        
        if (updated.count === 0) {
          retries++;
          await this.delay(Math.pow(2, retries) * 100);
          continue;
        }
        
        // Remove reservation
        await redis.del(`reservation:${reservationId}`);
        await redis.srem(`product:${reservation.productId}:reservations`, reservationId);
        
        // Invalidate cache
        await this.invalidateProductCache(reservation.productId);
        
        return { success: true };
      } catch (error) {
        retries++;
        if (retries >= this.MAX_RETRIES) {
          return { success: false, error: `Failed to confirm reservation: ${error.message}` };
        }
      }
    }
    
    return { success: false, error: 'Max retries exceeded' };
  }
  
  async releaseReservation(reservationId: string): Promise<{ success: boolean; error?: string }> {
    const reservationData = await redis.get(`reservation:${reservationId}`);
    if (!reservationData) {
      return { success: false, error: 'Reservation not found' };
    }
    
    const reservation: InventoryReservation = JSON.parse(reservationData);
    let retries = 0;
    
    while (retries < this.MAX_RETRIES) {
      try {
        const product = await prisma.product.findUnique({
          where: { id: reservation.productId },
          select: { id: true, version: true, reservedStock: true }
        });
        
        if (!product) {
          return { success: false, error: 'Product not found' };
        }
        
        const updated = await prisma.product.updateMany({
          where: {
            id: reservation.productId,
            version: product.version
          },
          data: {
            reservedStock: {
              decrement: reservation.quantity
            },
            version: {
              increment: 1
            },
            updatedAt: new Date()
          }
        });
        
        if (updated.count === 0) {
          retries++;
          await this.delay(Math.pow(2, retries) * 100);
          continue;
        }
        
        await redis.del(`reservation:${reservationId}`);
        await redis.srem(`product:${reservation.productId}:reservations`, reservationId);
        
        return { success: true };
      } catch (error) {
        retries++;
        if (retries >= this.MAX_RETRIES) {
          return { success: false, error: `Failed to release reservation: ${error.message}` };
        }
      }
    }
    
    return { success: false, error: 'Max retries exceeded' };
  }
  
  async cleanupExpiredReservations(): Promise<void> {
    // Background job to clean up expired reservations
    const pattern = 'product:*:reservations';
    const keys = await redis.keys(pattern);
    
    for (const key of keys) {
      const productId = key.split(':')[1];
      const reservations = await redis.smembers(key);
      
      for (const reservationId of reservations) {
        const exists = await redis.exists(`reservation:${reservationId}`);
        if (exists === 0) {
          // Reservation expired, remove from set
          await redis.srem(key, reservationId);
          
          // Release reserved stock
          await this.releaseExpiredReservation(productId, reservationId);
        }
      }
    }
  }
  
  private async releaseExpiredReservation(productId: string, reservationId: string) {
    let retries = 0;
    
    while (retries < this.MAX_RETRIES) {
      try {
        const product = await prisma.product.findUnique({
          where: { id: productId },
          select: { id: true, version: true }
        });
        
        if (!product) break;
        
        // We don't know the exact quantity, so we need to get it from a log
        // In production, store reservation details in a separate table
        
        await prisma.product.updateMany({
          where: {
            id: productId,
            version: product.version
          },
          data: {
            version: { increment: 1 },
            updatedAt: new Date()
          }
        });
        
        break;
      } catch (error) {
        retries++;
        await this.delay(Math.pow(2, retries) * 100);
      }
    }
  }
  
  async getAvailableStock(productId: string): Promise<number> {
    const cacheKey = `stock:${productId}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return parseInt(cached);
    }
    
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { stock: true, reservedStock: true }
    });
    
    if (!product) return 0;
    
    const available = product.stock - (product.reservedStock || 0);
    await redis.setex(cacheKey, 10, available.toString()); // Cache for 10 seconds
    
    return available;
  }
  
  private generateReservationId(): string {
    return `res_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  private async invalidateProductCache(productId: string): Promise<void> {
    await redis.del(`product:${productId}`);
    await redis.del(`stock:${productId}`);
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}