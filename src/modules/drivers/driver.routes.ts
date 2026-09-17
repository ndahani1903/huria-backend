import { AuthRequest } from "../../middleware/auth.middleware";
import { Request, Response } from 'express';
import { prisma } from '../../config/db';
import { Router } from 'express';
import { DriverController } from './driver.controller';
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import {
  apiRateLimiter,
  adminRateLimiter,
  withdrawalRateLimiter
} from '../../middleware/rateLimit.middleware';
import driverGamificationService from './gamification.service';
import redis from '../../config/redis';

const router = Router();

/**
 * Express params can be typed as string | string[] depending
 * on the installed Express/@types versions.
 *
 * This helper guarantees a valid string before passing a route
 * parameter into Prisma or a service method.
 */
const getParam = (
  value: string | string[] | undefined,
  name: string
): string => {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} is required`);
  }

  return value.trim();
};

// ============================================================
// DRIVER LOCATION AND STATUS ROUTES
// ============================================================

router.post(
  "/location",
  authMiddleware,
  apiRateLimiter,
  DriverController.updateLocation
);

router.get(
  '/location/check',
  authMiddleware,
  requireRole('driver'),
  DriverController.checkLocation
);

router.post(
  '/heartbeat',
  authMiddleware,
  apiRateLimiter,
  DriverController.heartbeat
);

router.post(
  '/online',
  authMiddleware,
  apiRateLimiter,
  DriverController.goOnline
);

router.post(
  '/offline',
  authMiddleware,
  apiRateLimiter,
  DriverController.goOffline
);

router.get(
  '/status',
  authMiddleware,
  apiRateLimiter,
  DriverController.getStatus
);

// ============================================================
// CLEANUP STALE DRIVERS
// ============================================================

router.post(
  '/cleanup-stale',
  authMiddleware,
  requireRole("admin"),
  adminRateLimiter,
  DriverController.cleanupStale
);

// ============================================================
// DRIVER GAMIFICATION
// ============================================================

// Get driver's gamification stats
router.get(
  '/gamification/stats',
  authMiddleware,
  requireRole('driver'),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user.id;

      const driver = await prisma.driver.findUnique({
        where: { userId }
      });

      if (!driver) {
        return res.status(404).json({
          error: 'Driver not found'
        });
      }

      const stats =
        await driverGamificationService.getDriverStats(
          driver.id
        );

      return res.json(stats);
    } catch (error: any) {
      return res.status(500).json({
        error: error.message
      });
    }
  }
);

// Get driver's current rank
router.get(
  '/gamification/rank',
  authMiddleware,
  requireRole('driver'),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user.id;

      const driver = await prisma.driver.findUnique({
        where: { userId }
      });

      if (!driver) {
        return res.status(404).json({
          error: 'Driver not found'
        });
      }

      const rank =
        await driverGamificationService.getDriverRank(
          driver.id
        );

      return res.json(rank);
    } catch (error: any) {
      return res.status(500).json({
        error: error.message
      });
    }
  }
);

// Get leaderboard
router.get(
  '/gamification/leaderboard/:period',
  authMiddleware,
  requireRole('driver'),
  async (req: AuthRequest, res: Response) => {
    try {
      const period = getParam(
        req.params.period,
        'Period'
      );

      if (
        !['daily', 'weekly', 'monthly'].includes(period)
      ) {
        return res.status(400).json({
          error:
            'Invalid period. Use daily, weekly, or monthly'
        });
      }

      const leaderboard =
        await driverGamificationService.getLeaderboard(
          period as 'daily' | 'weekly' | 'monthly'
        );

      // Get driver names for each entry
      const leaderboardWithNames =
        await Promise.all(
          leaderboard.map(async (entry) => {
            const driver =
              await prisma.driver.findUnique({
                where: {
                  id: entry.driverId
                },
                include: {
                  user: {
                    select: {
                      name: true
                    }
                  }
                }
              });

            const stats =
              await driverGamificationService.getDriverStats(
                entry.driverId
              );

            return {
              ...entry,
              name:
                driver?.user?.name ||
                'Unknown Driver',
              rating: stats.rating,
              streak: stats.streak,
              level: stats.level,
              deliveriesToday:
                stats.deliveriesToday
            };
          })
        );

      return res.json(leaderboardWithNames);
    } catch (error: any) {
      return res.status(500).json({
        error: error.message
      });
    }
  }
);

// Get driver's earned achievements
router.get(
  '/gamification/achievements',
  authMiddleware,
  requireRole('driver'),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user.id;

      const driver = await prisma.driver.findUnique({
        where: { userId }
      });

      if (!driver) {
        return res.status(404).json({
          error: 'Driver not found'
        });
      }

      const achievements =
        await driverGamificationService
          .getDriverAchievementsList(driver.id);

      return res.json(achievements);
    } catch (error: any) {
      return res.status(500).json({
        error: error.message
      });
    }
  }
);

// ============================================================
// ADMIN - GET DRIVER LOCATION
// ============================================================

router.get(
  '/:driverId/location',
  authMiddleware,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      const driverId = getParam(
        req.params.driverId,
        'Driver ID'
      );

      // Try Redis first
      const locationRaw =
        await redis.get(
          `driver:${driverId}:location`
        );

      if (locationRaw) {
        const location =
          JSON.parse(locationRaw);

        return res.json({
          lat: location.lat,
          lng: location.lng,
          source: 'realtime'
        });
      }

      // Fallback to database
      const driver =
        await prisma.driver.findUnique({
          where: {
            id: driverId
          },
          select: {
            currentLat: true,
            currentLng: true,
            lastLocationAt: true
          }
        });

      if (
        driver &&
        driver.currentLat !== null &&
        driver.currentLng !== null
      ) {
        return res.json({
          lat: driver.currentLat,
          lng: driver.currentLng,
          source: 'database'
        });
      }

      // No location found - Dar es Salaam default
      return res.json({
        lat: -6.7924,
        lng: 39.2083,
        source: 'default',
        message: 'Location not available'
      });
    } catch (error: any) {
      console.error(
        'Driver location error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }
);

// ============================================================
// DRIVER PROFILE
// ============================================================

router.get(
  '/profile',
  authMiddleware,
  requireRole('driver'),
  async (req: AuthRequest, res: Response) => {
    try {
      const driverId = req.user?.driverId;

      if (!driverId) {
        return res.status(404).json({
          error: 'Driver profile not found'
        });
      }

      const driver =
        await prisma.driver.findUnique({
          where: {
            id: driverId
          },
          include: {
            user: true,
            wallet: true
          }
        });

      if (!driver) {
        return res.status(404).json({
          error: 'Driver not found'
        });
      }

      return res.json(driver);
    } catch (error: any) {
      return res.status(500).json({
        error: error.message
      });
    }
  }
);

// ============================================================
// DRIVER ACCEPTS ORDER
// ============================================================

router.post(
  '/accept-order',
  authMiddleware,
  requireRole('driver'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { orderId } = req.body;
      const driverId = req.user?.driverId;

      if (
        typeof orderId !== 'string' ||
        !orderId.trim()
      ) {
        return res.status(400).json({
          error: 'Order ID is required'
        });
      }

      if (
        typeof driverId !== 'string' ||
        !driverId.trim()
      ) {
        return res.status(403).json({
          error: 'Driver account is not properly configured'
        });
      }

      const {
        DriverAssignmentService
      } = await import(
        '../../services/driverAssignment.service'
      );

      await DriverAssignmentService.handleDriverAccept(
        orderId.trim(),
        driverId
      );

      return res.json({
        success: true,
        message: 'Order accepted'
      });
    } catch (error: any) {
      return res.status(500).json({
        error: error.message
      });
    }
  }
);

// ============================================================
// DRIVER DECLINES ORDER
// ============================================================

router.post(
  '/decline-order',
  authMiddleware,
  requireRole('driver'),
  async (req: AuthRequest, res: Response) => {
    try {
      const { orderId } = req.body;
      const driverId = req.user?.driverId;

      if (
        typeof orderId !== 'string' ||
        !orderId.trim()
      ) {
        return res.status(400).json({
          error: 'Order ID is required'
        });
      }

      if (
        typeof driverId !== 'string' ||
        !driverId.trim()
      ) {
        return res.status(403).json({
          error: 'Driver account is not properly configured'
        });
      }

      const {
        DriverAssignmentService
      } = await import(
        '../../services/driverAssignment.service'
      );

      await DriverAssignmentService.handleDriverDecline(
        orderId.trim(),
        driverId
      );

      return res.json({
        success: true,
        message: 'Order declined'
      });
    } catch (error: any) {
      return res.status(500).json({
        error: error.message
      });
    }
  }
);

// ============================================================
// ADMIN - ALL DRIVER WITHDRAWALS
// ============================================================

router.get(
  '/admin/all',
  authMiddleware,
  requireRole('admin'),
  adminRateLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const withdrawals =
        await prisma.withdrawal.findMany({
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
          orderBy: {
            createdAt: 'desc'
          }
        });

      return res.json(withdrawals);
    } catch (error: any) {
      console.error(
        'Get all driver withdrawals error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }
);

// ============================================================
// DRIVER REQUESTS WITHDRAWAL
// ============================================================

router.post(
  '/withdrawal/request',
  authMiddleware,
  requireRole('driver'),
  withdrawalRateLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user.id;

      const {
        amount,
        phoneNumber,
        requestId
      } = req.body;

      if (
        !amount ||
        amount <= 0
      ) {
        return res.status(400).json({
          error: 'Valid amount is required'
        });
      }

      if (!phoneNumber) {
        return res.status(400).json({
          error: 'Phone number is required'
        });
      }

      const driver =
        await prisma.driver.findUnique({
          where: { userId }
        });

      if (!driver) {
        return res.status(404).json({
          error: 'Driver not found'
        });
      }

      const {
        DriverWithdrawalService
      } = await import(
        './driverWithdrawal.service'
      );

      const result =
        await DriverWithdrawalService.requestWithdrawal(
          driver.id,
          amount,
          phoneNumber,
          requestId
        );

      return res.json({
        success: true,
        withdrawal: result
      });
    } catch (error: any) {
      console.error(
        'Driver withdrawal error:',
        error
      );

      return res.status(400).json({
        error: error.message
      });
    }
  }
);

// ============================================================
// DRIVER WITHDRAWAL HISTORY
// ============================================================

router.get(
  '/withdrawal/history',
  authMiddleware,
  requireRole('driver'),
  apiRateLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user.id;

      const driver =
        await prisma.driver.findUnique({
          where: { userId }
        });

      if (!driver) {
        return res.status(404).json({
          error: 'Driver not found'
        });
      }

      const {
        DriverWithdrawalService
      } = await import(
        './driverWithdrawal.service'
      );

      const history =
        await DriverWithdrawalService.getWithdrawalHistory(
          driver.id
        );

      return res.json(history);
    } catch (error: any) {
      console.error(
        'Driver withdrawal history error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }
);

// ============================================================
// DRIVER WITHDRAWAL LIMITS
// ============================================================

router.get(
  '/withdrawal/limits',
  authMiddleware,
  requireRole('driver'),
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user.id;

      const driver =
        await prisma.driver.findUnique({
          where: { userId }
        });

      if (!driver) {
        return res.status(404).json({
          error: 'Driver not found'
        });
      }

      const {
        DriverWithdrawalService
      } = await import(
        './driverWithdrawal.service'
      );

      const limits =
        await DriverWithdrawalService.getWithdrawalLimits(
          driver.id
        );

      return res.json(limits);
    } catch (error: any) {
      console.error(
        'Driver withdrawal limits error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }
);

// ============================================================
// ADMIN PROCESSES DRIVER WITHDRAWAL
// ============================================================

router.post(
  '/withdrawal/:id/process',
  authMiddleware,
  requireRole('admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = getParam(
        req.params.id,
        'Withdrawal ID'
      );

      const {
        status,
        reason
      } = req.body;

      const adminId = req.user.id;

      const {
        DriverWithdrawalService
      } = await import(
        './driverWithdrawal.service'
      );

      let result;

      if (status === 'approved') {
        result =
          await DriverWithdrawalService.approveWithdrawal(
            id,
            adminId
          );
      } else if (status === 'rejected') {
        if (
          typeof reason !== 'string' ||
          !reason.trim()
        ) {
          return res.status(400).json({
            error: 'Rejection reason is required'
          });
        }

        result =
          await DriverWithdrawalService.rejectWithdrawal(
            id,
            adminId,
            reason.trim()
          );
      } else {
        return res.status(400).json({
          error: 'Invalid status'
        });
      }

      return res.json({
        success: true,
        withdrawal: result
      });
    } catch (error: any) {
      console.error(
        'Process driver withdrawal error:',
        error
      );

      return res.status(400).json({
        error: error.message
      });
    }
  }
);

// ============================================================
// ADMIN MARKS DRIVER WITHDRAWAL COMPLETED
// ============================================================

router.post(
  '/admin/:id/complete',
  authMiddleware,
  requireRole('admin'),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = getParam(
        req.params.id,
        'Withdrawal ID'
      );

      const {
        transactionReference
      } = req.body;

      const adminId = req.user.id;

      if (
        typeof transactionReference !== 'string' ||
        !transactionReference.trim()
      ) {
        return res.status(400).json({
          error: 'Transaction reference is required'
        });
      }

      const cleanTransactionReference =
        transactionReference.trim();

      // Get withdrawal
      const withdrawal =
        await prisma.withdrawal.findUnique({
          where: { id }
        });

      if (!withdrawal) {
        return res.status(404).json({
          error: 'Withdrawal not found'
        });
      }

      if (withdrawal.status !== 'approved') {
        return res.status(400).json({
          error:
            'Only approved withdrawals can be marked as completed'
        });
      }

      // Get driver separately.
      // This avoids relying on withdrawal.driver in the
      // generated Prisma type, which currently only exposes
      // driverId on the withdrawal object.
      const driver =
        await prisma.driver.findUnique({
          where: {
            id: withdrawal.driverId
          },
          include: {
            user: true,
            wallet: true
          }
        });

      if (!driver) {
        return res.status(404).json({
          error: 'Driver not found'
        });
      }

      // Update withdrawal
      const updated =
        await prisma.withdrawal.update({
          where: { id },
          data: {
            status: 'completed',
            processedAt: new Date(),
            reference:
              cleanTransactionReference
          }
        });

      // Update wallet pending balance
      await prisma.wallet.update({
        where: {
          driverId: withdrawal.driverId
        },
        data: {
          pendingBalance: {
            decrement: withdrawal.amount
          }
        }
      });

      // Send SMS notification
      if (driver.user?.phone) {
        const {
          SMSService
        } = await import(
          '../../services/sms.service'
        );

        await SMSService.sendRealSMS(
          driver.user.phone,
          `✅ Your withdrawal of TSh ${Number(
            withdrawal.amount
          ).toLocaleString()} has been COMPLETED. Transaction ref: ${cleanTransactionReference}`
        );
      }

      // Create audit log
      await prisma.auditLog.create({
        data: {
          adminId,
          action:
            'COMPLETE_DRIVER_WITHDRAWAL',
          targetType: 'withdrawal',
          targetId: id,
          meta: {
            amount: withdrawal.amount,
            transactionReference:
              cleanTransactionReference
          }
        }
      });

      return res.json({
        success: true,
        withdrawal: updated
      });
    } catch (error: any) {
      console.error(
        'Complete driver withdrawal error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }
);

export default router;