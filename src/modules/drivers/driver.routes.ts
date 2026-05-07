import { AuthRequest } from "../../middleware/auth.middleware";
import { Response } from 'express';
import { prisma } from '../../config/db'
import { Router } from 'express';
import { DriverController } from './driver.controller';
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { 
  rateLimitMiddleware, 
  authRateLimiter, 
  paymentRateLimiter 
} from '../../middleware/rateLimit.middleware';
import driverGamificationService from './gamification.service';


const router = Router();

// Driver location and status routes with rate limiting
router.post("/location", 
  authMiddleware, 
  rateLimitMiddleware,  // Prevent spam location updates
  DriverController.updateLocation
);

router.post('/heartbeat', 
  authMiddleware, 
  rateLimitMiddleware,  // Throttle heartbeat frequency
  DriverController.heartbeat
);

router.post('/online', 
  authMiddleware, 
  rateLimitMiddleware, 
  DriverController.goOnline
);

router.post('/offline', 
  authMiddleware, 
  rateLimitMiddleware, 
  DriverController.goOffline
);

router.get('/status', 
  authMiddleware, 
  rateLimitMiddleware, 
  DriverController.getStatus
);

// Cleanup endpoint (admin only)
router.post('/cleanup-stale', 
  authMiddleware, 
  requireRole("admin"), 
  rateLimitMiddleware,  // Prevent abuse of cleanup
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
          return {
            ...entry,
            name: driver?.user?.name || 'Unknown Driver'
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

export default router;
