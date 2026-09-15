import { prisma } from '../config/db';
import cron from 'node-cron';

export class CleanupService {
  
  // Run daily at 2 AM
  static startCleanupSchedule() {
    cron.schedule('0 2 * * *', async () => {
      console.log('🧹 Running scheduled cleanup job...');
      await this.cleanupOldOrders();
      await this.cleanupExpiredPaymentSessions();
    });
     
    console.log('✅ Cleanup service scheduled (runs daily at 2 AM)');
  }
  
  // Clean orders older than 7 days (completed/cancelled)
  static async cleanupOldOrders() {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      // Delete old completed orders (soft delete - move to archive)
      const oldCompletedOrders = await prisma.order.findMany({
        where: {
          status: { in: ['completed', 'cancelled'] },
          updatedAt: { lt: sevenDaysAgo }
        }
      });
      
      console.log(`📦 Found ${oldCompletedOrders.length} orders older than 7 days`);
      
      // Archive old orders (you can create an Archive table if needed)
      // For now, we'll just soft delete or mark as archived
      const archived = await prisma.order.updateMany({
        where: {
          status: { in: ['completed', 'cancelled'] },
          updatedAt: { lt: sevenDaysAgo }
        },
        data: {
          status: 'archived',
          metadata: {
            archivedAt: new Date().toISOString(),
            originalStatus: 'completed'
          }
        }
      });
      
      console.log(`✅ Archived ${archived.count} old orders`);
      
      return archived.count;
    } catch (error) {
      console.error('❌ Error cleaning old orders:', error);
      return 0;
    }
  }
  
  // Clean expired payment sessions (older than 24 hours)
  static async cleanupExpiredPaymentSessions() {
    try {
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      
      const expiredSessions = await prisma.payment.updateMany({
        where: {
          status: 'pending',
          createdAt: { lt: oneDayAgo }
        },
        data: {
          status: 'failed',
          failureReason: 'Payment session expired'
        }
      });
      
      console.log(`✅ Marked ${expiredSessions.count} expired payment sessions as failed`);
      
      return expiredSessions.count;
    } catch (error) {
      console.error('❌ Error cleaning expired sessions:', error);
      return 0;
    }
  }
  
  // Manual cleanup trigger (for testing)
  static async manualCleanup() {
    console.log('🔧 Manual cleanup triggered...');
    const ordersCleaned = await this.cleanupOldOrders();
    const sessionsCleaned = await this.cleanupExpiredPaymentSessions();
    
    return {
      ordersArchived: ordersCleaned,
      sessionsExpired: sessionsCleaned,
      timestamp: new Date().toISOString()
    };
  }
}