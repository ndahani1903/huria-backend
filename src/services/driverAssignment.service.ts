// src/services/driverAssignment.service.ts
import { prisma } from '../config/db';
import redis from '../config/redis';
import { io } from '../server';
import { calculateDistance } from '../utils/distance';

export interface AssignedDriver {
  driverId: string;
  assignedAt: Date;
  expiresAt: Date;
  status: 'pending_accept' | 'accepted' | 'declined' | 'expired';
}

export class DriverAssignmentService {
  private static readonly DRIVER_RESPONSE_TIMEOUT = 60 * 1000;
  private static readonly RETRY_INTERVALS = [0, 60, 180, 300, 600];
  private static readonly MAX_ASSIGNMENT_ATTEMPTS = 5;
  private static readonly STALE_ORDER_THRESHOLD = 10 * 60 * 1000;

  private static parseAssignment(raw: string | null): AssignedDriver | null {
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<AssignedDriver>;
      if (typeof parsed.driverId !== 'string' || typeof parsed.status !== 'string') return null;
      if (!['pending_accept', 'accepted', 'declined', 'expired'].includes(parsed.status)) return null;
      return {
        driverId: parsed.driverId,
        assignedAt: new Date(typeof parsed.assignedAt === 'string' || typeof parsed.assignedAt === 'number' ? parsed.assignedAt : Date.now()),
        expiresAt: new Date(typeof parsed.expiresAt === 'string' || typeof parsed.expiresAt === 'number' ? parsed.expiresAt : Date.now()),
        status: parsed.status as AssignedDriver['status'],
      };
    } catch {
      return null;
    }
  }
  /**
   * Assign a driver to an order (with timeout and fallback)
   */
  static async assignDriverWithTimeout(orderId: string, driverId: string): Promise<boolean> {
    const order = await prisma.order.findUnique({
      where: { orderId },
      select: { orderId: true, status: true, driverId: true },
    });

    if (!order || order.status !== 'assigned' || order.driverId !== driverId) {
      return false;
    }

    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { id: true, isActive: true, status: true },
    });

    if (!driver || !driver.isActive || !['busy', 'available', 'online'].includes(driver.status)) {
      return false;
    }

    const assignmentKey = `order:${orderId}:assigned_driver`;
    const assignmentData: AssignedDriver = {
      driverId,
      assignedAt: new Date(),
      expiresAt: new Date(Date.now() + this.DRIVER_RESPONSE_TIMEOUT),
      status: 'pending_accept',
    };

    await redis.setex(assignmentKey, 120, JSON.stringify(assignmentData));

    io.to(driverId).emit('order:assigned', {
      orderId,
      driverId,
      mustAcceptIn: this.DRIVER_RESPONSE_TIMEOUT / 1000,
      message: 'You have 60 seconds to accept this order',
    });

    setTimeout(() => {
      void this.handleDriverTimeout(orderId, driverId);
    }, this.DRIVER_RESPONSE_TIMEOUT);

    return true;
  }

  /**
   * Handle driver timeout - reassign or mark as failed
   */
  private static async handleDriverTimeout(orderId: string, driverId: string): Promise<void> {
    const assignmentKey = `order:${orderId}:assigned_driver`;
    const assignment = this.parseAssignment(await redis.get(assignmentKey));

    if (!assignment || assignment.driverId !== driverId || assignment.status !== 'pending_accept') {
      return;
    }

    const now = Date.now();
    if (assignment.expiresAt.getTime() > now) {
      return;
    }

    const released = await prisma.$transaction(async (tx) => {
      const current = await tx.order.findUnique({
        where: { orderId },
        select: { status: true, driverId: true },
      });

      if (!current || current.status !== 'assigned' || current.driverId !== driverId) {
        return false;
      }

      await tx.order.update({
        where: { orderId },
        data: { status: 'paid', driverId: null, tripStage: 'pending' },
      });

      await tx.driver.updateMany({
        where: { id: driverId, status: 'busy' },
        data: { status: 'available', isBusy: false },
      });

      return true;
    });

    await redis.del(assignmentKey);

    if (!released) return;

    await redis.sadd('unassigned_orders', orderId);
    io.emit('admin:assignment-failed', {
      orderId,
      driverId,
      reason: 'Driver did not accept in time',
      timestamp: new Date().toISOString(),
    });

    await this.startAssignment(orderId);
  }

  /**
   * Handle driver decline
   */
  static async handleDriverDecline(orderId: string, driverId: string): Promise<void> {
    const assignmentKey = `order:${orderId}:assigned_driver`;
    const assignment = this.parseAssignment(await redis.get(assignmentKey));

    if (!assignment || assignment.driverId !== driverId || assignment.status !== 'pending_accept') {
      throw new Error('Assignment is invalid or no longer pending for this driver');
    }

    const changed = await prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { orderId },
        select: { status: true, driverId: true },
      });

      if (!order || order.status !== 'assigned' || order.driverId !== driverId) return false;

      await tx.order.update({
        where: { orderId },
        data: { status: 'paid', driverId: null, tripStage: 'pending' },
      });
      await tx.driver.updateMany({
        where: { id: driverId },
        data: { status: 'available', isBusy: false },
      });
      return true;
    });

    await redis.del(assignmentKey);

    if (!changed) return;

    await redis.sadd('unassigned_orders', orderId);
    io.emit('admin:assignment-declined', {
      orderId,
      driverId,
      timestamp: new Date().toISOString(),
    });

    await this.startAssignment(orderId);
  }

  /**
   * Handle driver accept
   */
  static async handleDriverAccept(orderId: string, driverId: string): Promise<void> {
    const assignmentKey = `order:${orderId}:assigned_driver`;
    const assignment = this.parseAssignment(await redis.get(assignmentKey));

    if (!assignment || assignment.driverId !== driverId || assignment.status !== 'pending_accept') {
      throw new Error('Assignment is invalid or no longer pending for this driver');
    }

    const updated = await prisma.order.updateMany({
      where: { orderId, status: 'assigned', driverId },
      data: { status: 'assigned', tripStage: 'assigned' },
    });

    if (updated.count !== 1) {
      throw new Error('Order is no longer assigned to this driver');
    }

    assignment.status = 'accepted';
    await redis.setex(assignmentKey, 3600, JSON.stringify(assignment));
    await redis.srem('unassigned_orders', orderId);

    io.emit('admin:assignment-accepted', {
      orderId,
      driverId,
      timestamp: new Date().toISOString(),
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
    select: {
      status: true,
      driverId: true,
      merchant: { select: { merchantType: true } },
    },
  });

  if (!order) {
    throw new Error('Order not found');
  }

  if (order.status !== 'paid' || order.driverId !== null) {
    return;
  }
  
  if (order.merchant?.merchantType === 'RESTAURANT' || 
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
    
    // Claim the driver and order atomically to prevent two orders from taking
    // the same driver during concurrent assignment attempts.
    const bestDriver = availableDrivers[0];

    const claimed = await prisma.$transaction(async (tx) => {
      const driverClaim = await tx.driver.updateMany({
        where: {
          id: bestDriver.id,
          isActive: true,
          status: { in: ['available', 'online'] },
        },
        data: { status: 'busy', isBusy: true },
      });

      if (driverClaim.count !== 1) return false;

      const orderClaim = await tx.order.updateMany({
        where: { orderId, status: 'paid', driverId: null },
        data: { driverId: bestDriver.id, status: 'assigned', tripStage: 'assigned' },
      });

      if (orderClaim.count !== 1) {
        await tx.driver.updateMany({
          where: { id: bestDriver.id, status: 'busy' },
          data: { status: 'available', isBusy: false },
        });
        return false;
      }

      return true;
    });

    if (!claimed) {
      if (attemptNumber < this.MAX_ASSIGNMENT_ATTEMPTS - 1) {
        const nextDelay = this.RETRY_INTERVALS[attemptNumber + 1] * 1000;
        setTimeout(() => {
          void this.attemptAssignment(orderId, attemptNumber + 1);
        }, nextDelay);
      }
      return false;
    }

    let assignmentCreated = false;
    try {
      assignmentCreated = await this.assignDriverWithTimeout(orderId, bestDriver.id);
    } catch (error) {
      console.error(`Driver assignment setup failed for order ${orderId}:`, error);
    }

    if (!assignmentCreated) {
      await prisma.order.updateMany({
        where: { orderId, status: 'assigned', driverId: bestDriver.id },
        data: { status: 'paid', driverId: null, tripStage: 'pending' },
      });
      await prisma.driver.updateMany({
        where: { id: bestDriver.id, status: 'busy' },
        data: { status: 'available', isBusy: false },
      });
      await redis.sadd('unassigned_orders', orderId);
      return false;
    }

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
        try {
          const location = JSON.parse(locationRaw.toString()) as { lat?: unknown; lng?: unknown };
          if (typeof location.lat === 'number' && typeof location.lng === 'number') {
            driverLat = location.lat;
            driverLng = location.lng;
          }
        } catch {
          // Ignore malformed cached location and use the driver's persisted location.
        }
      }
      
      if (driverLat != null && driverLng != null && order.pickupLat != null && order.pickupLng != null) {
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
    return prisma.order.findMany({
      where: {
        status: 'paid',
        driverId: null,
      },
      include: {
        user: { select: { name: true, phone: true } },
        merchant: { select: { businessName: true, pickupLat: true, pickupLng: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Count orders currently waiting for driver assignment.
   * The database is the source of truth; Redis is only a dispatch index.
   */
  static async getPendingAssignmentsCount(): Promise<number> {
    return prisma.order.count({
      where: { status: 'paid', driverId: null },
    });
  }

  /**
   * Manual assign (bypasses timeout and retry)
   */
  static async manualAssign(orderId: string, driverId: string, adminId: string): Promise<any> {
    if (!orderId.trim() || !driverId.trim() || !adminId.trim()) {
      throw new Error('Order ID, driver ID and admin ID are required');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const driverClaim = await tx.driver.updateMany({
        where: {
          id: driverId,
          isActive: true,
          status: { in: ['available', 'online'] },
        },
        data: { status: 'busy', isBusy: true },
      });

      if (driverClaim.count !== 1) {
        throw new Error('Driver is not available for assignment');
      }

      const orderClaim = await tx.order.updateMany({
        where: { orderId, status: 'paid', driverId: null },
        data: { driverId, status: 'assigned', tripStage: 'assigned' },
      });

      if (orderClaim.count !== 1) {
        await tx.driver.updateMany({
          where: { id: driverId, status: 'busy' },
          data: { status: 'available', isBusy: false },
        });
        throw new Error('Order is not available for assignment');
      }

      const order = await tx.order.findUnique({
        where: { orderId },
        include: { user: true, merchant: true },
      });

      if (!order) throw new Error('Order not found after assignment');

      await tx.auditLog.create({
        data: {
          adminId,
          action: 'MANUAL_DRIVER_ASSIGNMENT',
          targetType: 'order',
          targetId: orderId,
          meta: { driverId },
        },
      });

      return order;
    });

    await redis.srem('unassigned_orders', orderId);
    await redis.del(`assignment:${orderId}`);

    io.to(driverId).emit('order:assigned', {
      orderId,
      driverId,
      assignedBy: 'admin',
      message: 'Order assigned to you by admin',
    });

    return updated;
  }

}