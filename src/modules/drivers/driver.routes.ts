import { AuthRequest } from "../../middleware/auth.middleware";
import { Response } from 'express';
import { prisma } from '../../config/db'
import { Router } from 'express';
import { DriverController } from './driver.controller';
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { 
  authRateLimiter,
  apiRateLimiter,
  adminRateLimiter,
  withdrawalRateLimiter, 
  paymentRateLimiter 
} from '../../middleware/rateLimit.middleware';
import driverGamificationService from './gamification.service';
import redis from '../../config/redis';

const router = Router();

// Driver location and status routes with rate limiting
router.post("/location", 
  authMiddleware, 
  apiRateLimiter,   // Prevent spam location updates
  DriverController.updateLocation
);

// In your driver routes
router.get('/location/check', authMiddleware, requireRole('driver'), DriverController.checkLocation);

router.post('/heartbeat', 
  authMiddleware, 
  apiRateLimiter,   // Throttle heartbeat frequency
  DriverController.heartbeat
);

router.post('/online', 
  authMiddleware, 
  apiRateLimiter,  
  DriverController.goOnline
);

router.post('/offline', 
  authMiddleware, 
  apiRateLimiter,  
  DriverController.goOffline
);

router.get('/status', 
  authMiddleware, 
  apiRateLimiter,  
  DriverController.getStatus
);

// Cleanup endpoint (admin only)
router.post('/cleanup-stale', 
  authMiddleware, 
  requireRole("admin"), 
  adminRateLimiter,  // Prevent abuse of cleanup
  DriverController.cleanupStale
);

// Get driver's gamification stats (streak, deliveries, etc.)
router.get('/gamification/stats', 
  authMiddleware, 
  requireRole('driver'), 
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const driver = await prisma.driver.findUnique({ where: { userId } });
      
      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }
      
      const stats = await driverGamificationService.getDriverStats(driver.id);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get driver's current rank on leaderboard
router.get('/gamification/rank', 
  authMiddleware, 
  requireRole('driver'), 
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const driver = await prisma.driver.findUnique({ where: { userId } });
      
      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }
      
      const rank = await driverGamificationService.getDriverRank(driver.id);
      res.json(rank);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get leaderboard (daily, weekly, monthly)
router.get('/gamification/leaderboard/:period', 
  authMiddleware, 
  requireRole('driver'), 
  async (req: AuthRequest, res: Response) => {
    try {
      const { period } = req.params;
      
      if (!['daily', 'weekly', 'monthly'].includes(period as string)) {
        return res.status(400).json({ error: 'Invalid period. Use daily, weekly, or monthly' });
      }
      
      const leaderboard = await driverGamificationService.getLeaderboard(period as any);
      
      // Get driver names for each entry
      const leaderboardWithNames = await Promise.all(
        leaderboard.map(async (entry) => {
          const driver = await prisma.driver.findUnique({
            where: { id: entry.driverId },
            include: { user: { select: { name: true } } }
          });

     const stats = await driverGamificationService.getDriverStats(entry.driverId);

          return {
            ...entry,
            name: driver?.user?.name || 'Unknown Driver',
            rating: stats.rating,
            streak: stats.streak,
            level: stats.level,
            deliveriesToday: stats.deliveriesToday
          };
        })
      );
      
      res.json(leaderboardWithNames);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get driver's earned achievements
router.get('/gamification/achievements', 
  authMiddleware, 
  requireRole('driver'), 
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const driver = await prisma.driver.findUnique({ where: { userId } });
      
      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }
      
      const achievements = await driverGamificationService.getDriverAchievementsList(driver.id);
      res.json(achievements);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get driver location (for admin)
// Get driver location (for admin)
router.get('/:driverId/location', 
  authMiddleware, 
  requireRole('admin'), 
  async (req: Request, res: Response) => {
    try {
      const { driverId } = req.params;
      // Try to get from Redis first (real-time location)
      const locationRaw = await redis.get(`driver:${driverId}:location`);
      
      if (locationRaw) {
        const location = JSON.parse(locationRaw);
        return res.json({ 
          lat: location.lat, 
          lng: location.lng,
          source: 'realtime'
        });
      }

   // Fallback to database location
      const driver = await prisma.driver.findUnique({
        where: { id: driverId },
        select: { currentLat: true, currentLng: true, lastLocationAt: true }
      });
      
      if (driver && driver.currentLat && driver.currentLng) {
        return res.json({ 
          lat: driver.currentLat, 
          lng: driver.currentLng,
          source: 'database'
        });
      }
      
      // No location found - return default (Dar es Salaam area)
      res.json({ 
        lat: -6.7924, 
        lng: 39.2083,
        source: 'default',
        message: 'Location not available'
      });
    } catch (error: any) {
      console.error('Driver location error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

router.get('/profile', authMiddleware, requireRole('driver'), async (req: Request, res: Response) => {
  try {
    const driverId = req.user?.driverId;
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true, wallet: true }
    });
    res.json(driver);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Driver accepts order (ADD THIS)
router.post('/accept-order', authMiddleware, requireRole('driver'), async (req: Request, res: Response) => {
  try {
    const { orderId } = req.body;
    const driverId = req.user?.driverId;
    
    const { DriverAssignmentService } = await import('../../services/driverAssignment.service');
    await DriverAssignmentService.handleDriverAccept(orderId, driverId);
    
    res.json({ success: true, message: 'Order accepted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Driver declines order (you already have this)
router.post('/decline-order', authMiddleware, requireRole('driver'), async (req: Request, res: Response) => {
  try {
    const { orderId } = req.body;
    const driverId = req.user?.driverId;
    
    const { DriverAssignmentService } = await import('../../services/driverAssignment.service');
    await DriverAssignmentService.handleDriverDecline(orderId, driverId);
    
    res.json({ success: true, message: 'Order declined' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin gets all driver withdrawals (ADD THIS)
router.get('/admin/all',
  authMiddleware,
  requireRole('admin'),
  adminRateLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const withdrawals = await prisma.withdrawal.findMany({
        include: {
          driver: {
            include: {
              user: {
                select: {
                  name: true,
                  phone: true
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      
      res.json(withdrawals);
    } catch (error: any) {
      console.error('Get all driver withdrawals error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);


// Driver requests withdrawal
router.post('/withdrawal/request',
  authMiddleware,
  requireRole('driver'),
  withdrawalRateLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const { amount, phoneNumber, requestId } = req.body;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Valid amount is required' });
      }
      if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
      }
      
      const driver = await prisma.driver.findUnique({
        where: { userId }
      });
      
      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }
      
      const { DriverWithdrawalService } = await import('./driverWithdrawal.service');
      const result = await DriverWithdrawalService.requestWithdrawal(driver.id, amount, phoneNumber, requestId);
      
      res.json({ success: true, withdrawal: result });
    } catch (error: any) {
      console.error('Driver withdrawal error:', error);
      res.status(400).json({ error: error.message });
    }
  }
);

// Driver gets withdrawal history
router.get('/withdrawal/history',
  authMiddleware,
  requireRole('driver'),
  apiRateLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const driver = await prisma.driver.findUnique({
        where: { userId }
      });
      
      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }
      
      const { DriverWithdrawalService } = await import('./driverWithdrawal.service');
      const history = await DriverWithdrawalService.getWithdrawalHistory(driver.id);
      
      res.json(history);
    } catch (error: any) {
      console.error('Driver withdrawal history error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Driver gets withdrawal limits
router.get('/withdrawal/limits',
  authMiddleware,
  requireRole('driver'),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user.id;
      const driver = await prisma.driver.findUnique({
        where: { userId }
      });
      
      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }
      
      const { DriverWithdrawalService } = await import('./driverWithdrawal.service');
      const limits = await DriverWithdrawalService.getWithdrawalLimits(driver.id);
      
      res.json(limits);
    } catch (error: any) {
      console.error('Driver withdrawal limits error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Admin processes driver withdrawal (approve/reject)
router.post('/withdrawal/:id/process',
  authMiddleware,
  requireRole('admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { status, reason } = req.body;
      const adminId = req.user.id;
      
      const { DriverWithdrawalService } = await import('./driverWithdrawal.service');
      
      let result;
      if (status === 'approved') {
        result = await DriverWithdrawalService.approveWithdrawal(id, adminId);
      } else if (status === 'rejected') {
        if (!reason) {
          return res.status(400).json({ error: 'Rejection reason is required' });
        }
        result = await DriverWithdrawalService.rejectWithdrawal(id, adminId, reason);
      } else {
        return res.status(400).json({ error: 'Invalid status' });
      }
      
      res.json({ success: true, withdrawal: result });
    } catch (error: any) {
      console.error('Process driver withdrawal error:', error);
      res.status(400).json({ error: error.message });
    }
  }
);


// Admin marks driver withdrawal as completed
router.post('/admin/:id/complete',
  authMiddleware,
  requireRole('admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { transactionReference } = req.body;
      const adminId = req.user.id;
      
      if (!transactionReference) {
        return res.status(400).json({ error: 'Transaction reference is required' });
      }
      
      const withdrawal = await prisma.withdrawal.findUnique({
        where: { id },
        include: { driver: { include: { user: true, wallet: true } } }
      });
      
      if (!withdrawal) {
        return res.status(404).json({ error: 'Withdrawal not found' });
      }
      
      if (withdrawal.status !== 'approved') {
        return res.status(400).json({ error: 'Only approved withdrawals can be marked as completed' });
      }
      
      const updated = await prisma.withdrawal.update({
        where: { id },
        data: {
          status: 'completed',
          processedAt: new Date(),
          reference: transactionReference 
        }
      });
      
      // Update wallet pending balance (remove from pending)
      await prisma.wallet.update({
        where: { driverId: withdrawal.driverId },
        data: {
          pendingBalance: { decrement: withdrawal.amount }
        }
      });
      
      // Send SMS notification to driver
      if (withdrawal.driver.user?.phone) {
        const { SMSService } = await import('../../services/sms.service');
        await SMSService.sendRealSMS(
          withdrawal.driver.user.phone,
          `✅ Your withdrawal of TSh ${Number(withdrawal.amount).toLocaleString()} has been COMPLETED. Transaction ref: ${transactionReference}`
        );
      }
      
      // Create audit log
      await prisma.auditLog.create({
        data: {
          adminId,
          action: 'COMPLETE_DRIVER_WITHDRAWAL',
          targetType: 'withdrawal',
          targetId: id,
          meta: { amount: withdrawal.amount, transactionReference }
        }
      });
      
      res.json({ success: true, withdrawal: updated });
    } catch (error: any) {
      console.error('Complete driver withdrawal error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
