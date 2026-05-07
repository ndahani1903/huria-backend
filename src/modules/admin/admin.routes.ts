import crypto from 'crypto';
import { Router, Request, Response } from "express";
import { prisma } from '../../config/db';
import { AdminController } from "./admin.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import {
 fetchAuditLogs
} from "./admin.controller";
import { 
  rateLimitMiddleware, 
  authRateLimiter, 
  paymentRateLimiter 
} from '../../middleware/rateLimit.middleware';
import driverGamificationService from '../drivers/gamification.service';

const router = Router();

// Stats
router.get("/stats", 
  authMiddleware, 
  requireRole("admin"), 
  rateLimitMiddleware,
  AdminController.stats
);

// User management
router.get("/users", 
  authMiddleware, 
  requireRole("admin"), 
  rateLimitMiddleware,
  AdminController.users
);

// Driver management
router.get("/drivers", 
  authMiddleware, 
  requireRole("admin"), 
  rateLimitMiddleware,
  AdminController.getDrivers
);

// Merchant management
router.get("/merchants", 
  authMiddleware, 
  requireRole("admin"), 
  rateLimitMiddleware,
  AdminController.getMerchants
);

// Order management
router.get("/orders", 
  authMiddleware, 
  requireRole("admin"), 
  rateLimitMiddleware,
  AdminController.getOrders
);

// Analytics management
router.get("/analytics", 
  authMiddleware, 
  requireRole("admin"), 
  rateLimitMiddleware,
  AdminController.getAnalytics
);

// Audit logs
router.get("/audit-logs", 
  authMiddleware, 
  requireRole("admin"), 
  rateLimitMiddleware,
  fetchAuditLogs
);

// Top drivers
router.get("/top-drivers", 
  authMiddleware, 
  requireRole("admin"), 
  rateLimitMiddleware,
  AdminController.topDrivers
);

// Dispute management
router.get('/disputes', 
  authMiddleware, 
  requireRole("admin"), 
  rateLimitMiddleware,
  AdminController.getDisputes
);

router.put('/disputes/:id', 
  authMiddleware, 
  requireRole("admin"), 
  rateLimitMiddleware,
  AdminController.updateDispute
);

// Withdrawal management
router.get('/withdrawals', 
  authMiddleware, 
  requireRole("admin"), 
  rateLimitMiddleware,
  AdminController.getWithdrawals
);

router.put('/withdrawals/:id', 
  authMiddleware, 
  requireRole("admin"), 
  rateLimitMiddleware,
  AdminController.updateWithdrawal
);

// Admin: Get all driver achievements
router.get('/gamification/achievements/all', 
  authMiddleware, 
  requireRole('admin'), 
  async (req: Request, res: Response) => {
    const achievements = await prisma.driverAchievement.findMany({
      include: { 
        driver: { 
          include: { user: { select: { name: true, email: true, phone: true } } } 
        } 
      },
      orderBy: { awardedAt: 'desc' },
      take: 100
    });
    res.json(achievements);
  }
);

// Admin: Get leaderboard for all periods
router.get('/gamification/leaderboard/all', 
  authMiddleware, 
  requireRole('admin'), 
  async (req: Request, res: Response) => {
    const [daily, weekly, monthly] = await Promise.all([
      driverGamificationService.getLeaderboard('daily'),
      driverGamificationService.getLeaderboard('weekly'),
      driverGamificationService.getLeaderboard('monthly')
    ]);
    res.json({ daily, weekly, monthly });
  }
);

// Admin: Manually add bonus to driver
router.post('/gamification/add-bonus', 
  authMiddleware, 
  requireRole('admin'), 
  async (req: Request, res: Response) => {
    const { driverId, amount, reason } = req.body;
    await driverGamificationService.addBonus(driverId, amount, reason);
    res.json({ success: true, message: 'Bonus added' });
  }
);

/* // For user deletion or role changes
router.delete("/users/:id", 
  authMiddleware, 
  requireRole("admin"), 
  authRateLimiter,  // Stricter limit for sensitive operations
  AdminController.deleteUser
);

// admin.routes.ts
router.get('/active-orders', authMiddleware, requireRole('admin'), AdminController.getActiveOrders);
router.get('/drivers-status', authMiddleware, requireRole('admin'), AdminController.getDriversStatus);
router.get('/dashboard-stats', authMiddleware, requireRole('admin'), AdminController.getDashboardStats);   */

export default router;
