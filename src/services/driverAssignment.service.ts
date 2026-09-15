// src/services/driverAssignment.service.ts
import { prisma } from '../config/db';
import redis from '../config/redis';
import { io } from '../server';
import { calculateDistance } from '../utils/distance';
import { DeliveryFeeService } from './delivery.service';
import { DriverService } from '../modules/drivers/driver.service';
import { SMSService } from './sms.service';

export interface AssignedDriver {
  driverId: string;
  assignedAt: Date;
  expiresAt: Date;
  status: 'pending_accept' | 'accepted' | 'declined' | 'expired';
}

export class DriverAssignmentService {
  private static readonly DRIVER_RESPONSE_TIMEOUT = 60 * 1000; // 60 seconds to accept
  private static readonly RETRY_INTERVALS = [0, 60, 180, 300, 600]; // seconds
  private static readonly MAX_ASSIGNMENT_ATTEMPTS = 5;
  private static readonly STALE_ORDER_THRESHOLD = 10 * 60 * 1000; // 10 minutes

  /**
   * Assign a driver to an order (with timeout and fallback)
   */
  static async assignDriverWithTimeout(orderId: string, driverId: string): Promise<boolean> {
    console.log(`⏰ Assigning driver ${driverId} to order ${orderId} with ${this.DRIVER_RESPONSE_TIMEOUT/1000}s timeout`);
    
    // Store assignment with expiry
    const assignmentKey = `order:${orderId}:assigned_driver`;
    const assignmentData: AssignedDriver = {
      driverId,
      assignedAt: new Date(),
      expiresAt: new Date(Date.now() + this.DRIVER_RESPONSE_TIMEOUT),
      status: 'pending_accept'
    };
    
    await redis.setex(assignmentKey, 120, JSON.stringify(assignmentData));
    
    // Emit to driver
    io.to(driverId).emit("order:assigned", {
      orderId,
      driverId,
      mustAcceptIn: this.DRIVER_RESPONSE_TIMEOUT / 1000,
      message: "You have 60 seconds to accept this order"
    });
    
    // Set timeout to check if driver accepted
    setTimeout(async () => {
      const currentAssignment = await redis.get(assignmentKey);
      if (currentAssignment) {
        const data: AssignedDriver = JSON.parse(currentAssignment);
        if (data.status === 'pending_accept') {
          console.log(`⏰ Driver ${driverId} did not accept order ${orderId} in time`);
          await this.handleDriverTimeout(orderId, driverId);
        }
      }
    }, this.DRIVER_RESPONSE_TIMEOUT);
    
    return true;
  }

  /**
   * Handle driver timeout - reassign or mark as failed
   */
  private static async handleDriverTimeout(orderId: string, driverId: string): Promise<void> {
    console.log(`🚨 Driver ${driverId} timeout for order ${orderId}`);
    
    // Mark driver as available again
    await DriverService.markAvailable(driverId);
    
    // Remove assignment
    await redis.del(`order:${orderId}:assigned_driver`);
    
    // Get current order status
    const order = await prisma.order.findUnique({
      where: { orderId },
      select: { status: true, driverId: true }
    });
    
    // Only reassign if order is still assigned to this driver and not accepted
    if (order && order.status === 'assigned' && order.driverId === driverId) {
      // Reset order status to paid
      await prisma.order.update({
        where: { orderId },
        data: { 
          status: 'paid',
          driverId: null,
          tripStage: 'pending'
        }
      });
      
      // Add to unassigned orders set in Redis
      await redis.sadd("unassigned_orders", orderId);
      
      // Notify admin dashboard
      io.emit("admin:assignment-failed", {
        orderId,
        driverId,
        reason: "Driver did not accept in time",
        timestamp: new Date().toISOString()
      });
      
      // Retry assignment
      await this.startAssignment(orderId);
    }
  }

  /**
   * Handle driver decline
   */
  static async handleDriverDecline(orderId: string, driverId: string): Promise<void> {
    console.log(`🚨 Driver ${driverId} declined order ${orderId}`);
    
    // Remove assignment
    await redis.del(`order:${orderId}:assigned_driver`);
    
    // Mark driver as available
    await DriverService.markAvailable(driverId);
    
    // Reset order
    const order = await prisma.order.findUnique({
      where: { orderId },
      select: { status: true }
    });
    
    if (order && order.status === 'assigned') {
      await prisma.order.update({
        where: { orderId },
        data: { 
          status: 'paid',
          driverId: null,
          tripStage: 'pending'
        }
      });
      
      // Add to unassigned
      await redis.sadd("unassigned_orders", orderId);
      
      // Notify admin
      io.emit("admin:assignment-declined", {
        orderId,
        driverId,
        timestamp: new Date().toISOString()
      });
      
      // Retry assignment
      await this.startAssignment(orderId);
    }
  }

  /**
   * Handle driver accept
   */
  static async handleDriverAccept(orderId: string, driverId: string): Promise<void> {
    console.log(`✅ Driver ${driverId} accepted order ${orderId}`);
    
    // Update assignment status
    const assignmentKey = `order:${orderId}:assigned_driver`;
    const assignment = await redis.get(assignmentKey);
    if (assignment) {
      const data: AssignedDriver = JSON.parse(assignment);
      data.status = 'accepted';
      await redis.setex(assignmentKey, 3600, JSON.stringify(data));
    }
    
    // Remove from unassigned
    await redis.srem("unassigned_orders", orderId);
    
    // Update order status
    await prisma.order.update({
      where: { orderId },
      data: { 
        status: 'assigned',
        tripStage: 'assigned'
      }
    });
    
    // Notify admin
    io.emit("admin:assignment-accepted", {
      orderId,
      driverId,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Start assignment process for an order
   */
  static async startAssignment(orderId: string): Promise<void> {
    console.log(`🚀 Starting driver assignment for order ${orderId}`);

    // Check if this is a Restaurant or Supermarket order (should use manual dispatch)
  const order = await prisma.order.findUnique({
    where: { orderId },
    include: { merchant: { select: { merchantType: true } } }
  });
  
  if (order?.merchant?.merchantType === 'RESTAURANT' || 
      order?.merchant?.merchantType === 'SUPERMARKET') {
    console.log(`⚠️ Order ${orderId} is ${order.merchant.merchantType} - Using MANUAL dispatch, skipping auto-assignment`);
    return;
  }

    // Add to unassigned orders set
    await redis.sadd("unassigned_orders", orderId);
    
    const assignmentKey = `assignment:${orderId}`;
    const assignmentData = {
      orderId,
      status: 'pending',
      attempts: 0,
      startedAt: new Date().toISOString(),
      lastAttemptAt: new Date().toISOString()
    };
    
    await redis.setex(assignmentKey, 3600, JSON.stringify(assignmentData));
    await this.attemptAssignment(orderId, 0);
  }

  /**
   * Attempt to assign a driver
   */
  static async attemptAssignment(orderId: string, attemptNumber: number): Promise<boolean> {
    console.log(`📍 Assignment attempt ${attemptNumber + 1} for order ${orderId}`);
    
    const order = await prisma.order.findUnique({
      where: { orderId },
      include: { user: true, merchant: true }
    });
    
    if (!order) return false;
    
    // Check if order is still eligible
    if (order.status !== 'paid') {
      console.log(`⚠️ Order ${orderId} status is ${order.status}, stopping assignment`);
      await redis.srem("unassigned_orders", orderId);
      return false;
    }
    
    // Find available drivers
    const availableDrivers = await this.findAvailableDrivers(order);
    
    if (availableDrivers.length === 0) {
      console.log(`⚠️ No drivers available for order ${orderId}`);
      
      if (attemptNumber < this.MAX_ASSIGNMENT_ATTEMPTS - 1) {
        const nextDelay = this.RETRY_INTERVALS[attemptNumber + 1] * 1000;
        setTimeout(() => {
          this.attemptAssignment(orderId, attemptNumber + 1);
        }, nextDelay);
        
        // Update assignment record
        const assignmentKey = `assignment:${orderId}`;
        const assignment = await redis.get(assignmentKey);
        if (assignment) {
          const data = JSON.parse(assignment);
          data.attempts = attemptNumber + 1;
          data.lastAttemptAt = new Date().toISOString();
          await redis.setex(assignmentKey, 3600, JSON.stringify(data));
        }
        
        // Alert if order has been waiting too long
        const timeSinceCreation = Date.now() - new Date(order.createdAt).getTime();
        if (timeSinceCreation >= this.STALE_ORDER_THRESHOLD) {
          await this.alertStaleOrder(orderId, attemptNumber + 1);
        }
        
        return false;
      } else {
        await this.markAssignmentFailed(orderId);
        return false;
      }
    }
    
    // Assign best driver
    const bestDriver = availableDrivers[0];
    console.log(`✅ Assigning driver ${bestDriver.id} to order ${orderId}`);
    
    // Assign with timeout
    await this.assignDriverWithTimeout(orderId, bestDriver.id);
    
    // Update order with driver info (but keep status as assigned_waiting)
    await prisma.order.update({
      where: { orderId },
      data: {
        driverId: bestDriver.id,
        status: 'assigned',
        tripStage: 'assigned'
      }
    });
    
    await this.cleanupAssignment(orderId);
    return true;
  }

  /**
   * Find available drivers sorted by distance
   */
  private static async findAvailableDrivers(order: any): Promise<any[]> {
    const driverIdsRaw = await redis.smembers("drivers:available");
    let driverIds: string[] = [];
    
    if (driverIdsRaw instanceof Set) {
      driverIds = Array.from(driverIdsRaw).map(id => id.toString());
    } else if (Array.isArray(driverIdsRaw)) {
      driverIds = driverIdsRaw.map(id => id.toString());
    }
    
    if (driverIds.length === 0) return [];
    
    const drivers = await prisma.driver.findMany({
      where: {
        id: { in: driverIds },
        isActive: true,
        status: { in: ['available', 'online'] }
      },
      include: { user: true }
    });
    
    const driversWithDistance = [];
    
    for (const driver of drivers) {
      const locationRaw = await redis.get(`driver:${driver.id}:location`);
      let driverLat = driver.currentLat;
      let driverLng = driver.currentLng;
      
      if (locationRaw) {
        const location = JSON.parse(locationRaw.toString());
        driverLat = location.lat;
        driverLng = location.lng;
      }
      
      if (driverLat && driverLng && order.pickupLat && order.pickupLng) {
        const distance = calculateDistance(
          order.pickupLat,
          order.pickupLng,
          driverLat,
          driverLng
        );
        driversWithDistance.push({ ...driver, distance });
      }
    }
    
    driversWithDistance.sort((a, b) => a.distance - b.distance);
    return driversWithDistance;
  }

  /**
   * Alert about stale orders (for admin dashboard)
   */
  private static async alertStaleOrder(orderId: string, attemptNumber: number): Promise<void> {
    const order = await prisma.order.findUnique({
      where: { orderId },
      include: { user: true, merchant: true }
    });
    
    if (!order) return;
    
    // Create notification
    await prisma.notification.create({
      data: {
        userId: 'system',
        type: 'stale_order_alert',
        title: '⚠️ Order Assignment Delayed',
        message: `Order ${order.orderId} has been waiting for ${Math.floor((Date.now() - new Date(order.createdAt).getTime())/60000)} minutes. Attempt ${attemptNumber}.`,
        data: { orderId, attemptNumber }
      }
    });
    
    // Socket event for admin
    io.emit("admin:stale-order", {
      orderId: order.orderId,
      customerPhone: order.user?.phone,
      merchantName: order.merchant?.businessName,
      waitingMinutes: Math.floor((Date.now() - new Date(order.createdAt).getTime())/60000),
      attemptNumber,
      timestamp: new Date().toISOString()
    });
  }

  private static async markAssignmentFailed(orderId: string): Promise<void> {
    await prisma.order.update({
      where: { orderId },
      data: {
        metadata: {
          assignmentFailed: true,
          assignmentFailedAt: new Date().toISOString()
        }
      }
    });
    
    await redis.srem("unassigned_orders", orderId);
    
    io.emit("admin:assignment-failed-permanent", {
      orderId,
      timestamp: new Date().toISOString()
    });
  }

  private static async cleanupAssignment(orderId: string): Promise<void> {
    await redis.del(`assignment:${orderId}`);
  }

  /**
   * Get all unassigned orders (for admin panel)
   */
  static async getUnassignedOrders(): Promise<any[]> {
    const unassignedIds = await redis.smembers("unassigned_orders");
    let ids: string[] = [];
    
    if (unassignedIds instanceof Set) {
      ids = Array.from(unassignedIds).map(id => id.toString());
    } else if (Array.isArray(unassignedIds)) {
      ids = unassignedIds.map(id => id.toString());
    }
    
    if (ids.length === 0) return [];
    
    const orders = await prisma.order.findMany({
      where: {
        orderId: { in: ids },
        status: 'paid'
      },
      include: {
        user: { select: { name: true, phone: true } },
        merchant: { select: { businessName: true, pickupLat: true, pickupLng: true } }
      },
      orderBy: { createdAt: 'asc' }
    });
    
    return orders;
  }

  /**
   * Manual assign (bypasses timeout and retry)
   */
  static async manualAssign(orderId: string, driverId: string, adminId: string): Promise<any> {
    console.log(`👤 Manual assignment: Admin ${adminId} assigning driver ${driverId} to order ${orderId}`);
    
    // Remove from unassigned
    await redis.srem("unassigned_orders", orderId);
    
    // Mark driver as busy
    await DriverService.markBusy(driverId);
    
    // Update order
    const updated = await prisma.order.update({
      where: { orderId },
      data: {
        driverId: driverId,
        status: 'assigned',
        tripStage: 'assigned'
      }
    });
    
    // Notify driver immediately
    io.to(driverId).emit("order:assigned", {
      orderId,
      driverId,
      assignedBy: 'admin',
      message: "Order assigned to you by admin"
    });
    
    return updated;
  }
}