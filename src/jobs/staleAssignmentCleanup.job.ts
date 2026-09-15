// src/jobs/staleAssignmentCleanup.job.ts
import { prisma } from '../config/db';
import redis from '../config/redis';
import { io } from '../server';

/**
 * Clean up orders that are stuck in 'assigned' status but the driver never accepted
 * Runs every 2 minutes
 */
export async function cleanupStaleAssignments() {
  console.log('🧹 Running stale assignment cleanup...', new Date().toISOString());
  
  // Find orders that are 'assigned' but created more than 5 minutes ago
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
  
  const staleAssignedOrders = await prisma.order.findMany({
    where: {
      status: 'assigned',
      createdAt: { lt: fiveMinutesAgo },
      // Exclude orders that have been accepted (driver has started pickup)
      tripStage: { notIn: ['arrived_pickup', 'picked_up', 'en_route', 'delivered'] }
    },
    include: {
      driver: true
    }
  });
  
  console.log(`📋 Found ${staleAssignedOrders.length} stale assigned orders`);
  
  for (const order of staleAssignedOrders) {
    console.log(`🔄 Resetting stale order ${order.orderId} (assigned to ${order.driverId})`);
    
    // Reset order status
    await prisma.order.update({
      where: { orderId: order.orderId },
      data: {
        status: 'paid',
        driverId: null,
        tripStage: 'pending',
        metadata: {
          ...(order.metadata as any || {}),
          resetDueToStale: true,
          previousDriverId: order.driverId,
          resetAt: new Date().toISOString()
        }
      }
    });
    
    // Free up the driver
    if (order.driverId) {
      await redis.sadd("drivers:available", order.driverId);
      await prisma.driver.update({
        where: { id: order.driverId },
        data: { status: 'available', isBusy: false }
      });
    }
    
    // Remove from any assignment tracking
    await redis.del(`order:${order.orderId}:assigned_driver`);
    
    // Add back to unassigned orders
    await redis.sadd("unassigned_orders", order.orderId);
    
    // Notify admin dashboard
    io.emit("admin:stale-order-reset", {
      orderId: order.orderId,
      previousDriverId: order.driverId,
      timestamp: new Date().toISOString()
    });
    
    // Restart assignment process
    const { DriverAssignmentService } = await import('../services/driverAssignment.service');
    await DriverAssignmentService.startAssignment(order.orderId);
  }
  
  console.log(`✅ Cleaned up ${staleAssignedOrders.length} stale orders`);
}

// Run every 2 minutes
if (process.env.NODE_ENV !== 'test') {
  setInterval(cleanupStaleAssignments, 2 * 60 * 1000);
  console.log('⏰ Stale assignment cleanup job scheduled (every 2 minutes)');
}