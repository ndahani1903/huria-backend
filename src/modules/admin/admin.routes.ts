// src/modules/admin/admin.routes.ts

import { Router, Request, Response } from "express";
import { prisma } from '../../config/db';
import { AdminController } from "./admin.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import {
 fetchAuditLogs
} from "./admin.controller";
import { 
  authRateLimiter
} from '../../middleware/rateLimit.middleware';
import driverGamificationService from '../drivers/gamification.service';
import redis from '../../config/redis';
import { DriverAssignmentService } from '../../services/driverAssignment.service';
import PriorityOrderService from '../orders/priorityOrder.service';

const router = Router();

const getQueryString = (value: unknown, fallback: string): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return fallback;
};

const getParamString = (value: string | string[] | undefined, name: string): string => {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) return value[0].trim();
  throw new Error(`Missing ${name}`);
};

const getPagination = (pageValue: unknown, limitValue: unknown, defaultLimit = 50, maxLimit = 200) => {
  const page = Math.max(1, Number.parseInt(getQueryString(pageValue, "1"), 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(getQueryString(limitValue, String(defaultLimit)), 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

const getDistanceKmFromMetadata = (metadata: unknown, fallback = 5): number => {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const value = (metadata as Record<string, unknown>).distanceKm;
    const distance = Number(value);
    if (Number.isFinite(distance) && distance >= 0) return distance;
  }
  return fallback;
};

// Keep your existing routes below...
router.get('/ping-auth', authMiddleware, requireRole('admin'), (req, res) => {
  console.log("✅ Auth test - User:", req.user);
  res.json({ 
    status: 'ok', 
    user: { id: req.user?.id, role: req.user?.role }
  });
});

// Usage in routes
router.get("/revenue", 
  authMiddleware, 
   requireRole("admin"), 
  AdminController.getRevenue
);

// Stats
router.get("/stats", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.stats
);

// User management
router.get("/users", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.users
);

// Driver management
router.get("/drivers", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.getDrivers
);

// Merchant management
router.get("/merchants", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.getMerchants
);

// Order management
router.get("/orders", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.getOrders
);

// Analytics management
router.get("/analytics", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.getAnalytics
);

// Audit logs
router.get("/audit-logs", 
  authMiddleware, 
  requireRole("admin"), 
  fetchAuditLogs
);

// Top drivers
router.get("/top-drivers", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.topDrivers
);

// Dispute management
router.get('/disputes', 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.getDisputes
);

router.put('/disputes/:id', 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.updateDispute
);

// Withdrawal management
router.get('/withdrawals', 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.getWithdrawals
);

router.put('/withdrawals/:id', 
  authMiddleware, 
  requireRole("admin"), 
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


router.put("/users/:id", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.updateUser
);

router.patch("/users/:id/status", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.updateUserStatus
);

 // For user deletion or role changes
router.delete("/users/:id", 
  authMiddleware, 
  requireRole("admin"), 
  authRateLimiter,  // Stricter limit for sensitive operations
  AdminController.deleteUser
);

router.get("/users/:id/activity", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.getUserActivity
);

router.get("/export", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.exportData
);

router.get("/settings", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.getSettings
);

router.post("/settings", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.saveSettings
);

// Backup Routes
router.post("/backup", 
  authMiddleware, 
  requireRole("admin"), 
  authRateLimiter,
  AdminController.createBackup
);

router.post("/backup/schedule", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.scheduleBackup
);

router.get("/backup/download/:filename", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.downloadBackup
);

router.post("/restore", 
  authMiddleware, 
  requireRole("admin"), 
  authRateLimiter,
  AdminController.restoreBackup
);

// API Keys Routes
router.get("/api-keys", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.getApiKeys
);

router.post("/api-keys", 
  authMiddleware, 
  requireRole("admin"), 
  authRateLimiter,
  AdminController.createApiKey
);

router.delete("/api-keys/:id", 
  authMiddleware, 
  requireRole("admin"), 
  authRateLimiter,
  AdminController.revokeApiKey
);

router.put("/api-keys/:id", 
  authMiddleware, 
  requireRole("admin"), 
  authRateLimiter,
  AdminController.updateApiKey
);

// System Health Routes
router.get("/health", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.getSystemHealth
);

// Support Routes
router.get("/support/tickets", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.getSupportTickets
);

router.patch("/support/tickets/:id", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.updateSupportTicket
);

router.post("/support/tickets/:id/reply", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.replyToTicket
);

// Role Management Routes
router.get("/roles", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.getRoles
);

router.post("/roles", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.createRole
);

router.put("/roles/:id", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.updateRole
);

router.delete("/roles/:id", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.deleteRole
);

router.get("/users/roles", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.getUserRoles
);

router.put("/users/:id/role", 
  authMiddleware, 
  requireRole("admin"), 
  AdminController.assignUserRole
);


router.get('/active-orders', 
  authMiddleware, 
  requireRole('admin'), 
  async (req: Request, res: Response) => {
    try {
      const orders = await prisma.order.findMany({
        where: {
          status: { in: ['pending', 'paid', 'assigned', 'picked_up', 'en_route'] }
        },
        include: {
          user: { select: { name: true, phone: true, email: true } },
          driver: { include: { user: { select: { name: true, phone: true } } } },
          merchant: { select: { businessName: true, name: true } }
        },
        orderBy: { createdAt: 'desc' }
      });
      res.json(orders);
    } catch (error: any) {
      console.error('Active orders error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);


router.get('/drivers-status',
  authMiddleware, 
  requireRole('admin'), 
  async (req: Request, res: Response) => {
    try {
      const available = await prisma.driver.findMany({
        where: { status: 'available', isActive: true },
        include: { user: { select: { name: true, phone: true } } }
      });
      
      const busy = await prisma.driver.findMany({
        where: { status: 'busy' },
        include: { user: { select: { name: true, phone: true } } }
      });
      
      res.json({ available, busy });
    } catch (error: any) {
      console.error('Drivers status error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get('/dashboard-stats', 
  authMiddleware, 
  requireRole('admin'), 
  async (req: Request, res: Response) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      // Helper function to calculate average delivery time
      const calculateAvgDeliveryTime = async () => {
        const completedOrders = await prisma.order.findMany({
          where: { 
            status: 'completed',
            pickupTime: { not: null },
            deliveryTime: { not: null }
          },
          select: { pickupTime: true, deliveryTime: true }
        });
        
        if (completedOrders.length === 0) return 0;
        
        let totalMinutes = 0;
        let count = 0;
        
        for (const order of completedOrders) {
          if (order.pickupTime && order.deliveryTime) {
            const minutes = (order.deliveryTime.getTime() - order.pickupTime.getTime()) / 60000;
            if (minutes > 0) {
              totalMinutes += minutes;
              count++;
            }
          }
        }
        
        return count > 0 ? Math.round(totalMinutes / count) : 0;
      };
      
      const [totalActiveOrders, totalDriversOnline, totalDriversBusy, avgDeliveryTime, totalRevenueToday] = await Promise.all([
        prisma.order.count({
          where: { status: { notIn: ['completed', 'cancelled'] } }
        }),
        prisma.driver.count({
          where: { isActive: true, status: 'available' }
        }),
        prisma.driver.count({
          where: { status: 'busy' }
        }),
        calculateAvgDeliveryTime(),
        prisma.order.aggregate({
          where: {
            status: 'completed',
            createdAt: { gte: today }
          },
          _sum: { amount: true }
        })
      ]);
      
      const stats = {
        totalActiveOrders,
        totalDriversOnline,
        totalDriversBusy,
        avgDeliveryTime,
        totalRevenueToday: totalRevenueToday._sum.amount || 0
      };
      
      res.json(stats);
    } catch (error: any) {
      console.error('Dashboard stats error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);


router.get('/merchants-locations', 
  authMiddleware, 
  requireRole('admin'), 
  async (req: Request, res: Response) => {
    try {
      const merchants = await prisma.merchant.findMany({
        where: {
          pickupLat: { not: null },
          pickupLng: { not: null }
        },
        select: {
          id: true,
          name: true,
          businessName: true,
          phone: true,
          email: true,
          pickupLat: true,
          pickupLng: true,
          pickupAddress: true,
          totalSales: true,
          totalRevenue: true,
          user: {
            select: { name: true, email: true, phone: true }
          }
        }
      });
      
      // Format response to match expected structure
      const formattedMerchants = merchants.map(m => ({
        id: m.id,
        name: m.businessName || m.name,
        ownerName: m.user?.name,
        phone: m.phone,
        email: m.user?.email,
        category: 'merchant',
        latitude: m.pickupLat,
        longitude: m.pickupLng,
        address: m.pickupAddress,
        totalOrders: m.totalSales,
        totalRevenue: m.totalRevenue
      }));
      
      res.json(formattedMerchants);
    } catch (error: any) {
      console.error('Merchants locations error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Manual driver assignment (admin)
router.post('/assign-driver', 
  authMiddleware, 
  requireRole('admin'), 
  async (req: Request, res: Response) => {
    try {
      const { orderId, driverId } = req.body;
      const adminId = req.user!.id;

      if (typeof orderId !== "string" || !orderId.trim() || typeof driverId !== "string" || !driverId.trim()) {
        return res.status(400).json({ error: "orderId and driverId are required" });
      }

      const normalizedOrderId = orderId.trim();
      const normalizedDriverId = driverId.trim();
      
      const order = await prisma.order.findUnique({
        where: { orderId: normalizedOrderId },
        include: { 
          user: true,
          merchant: true 
        }
      });
      
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      if (order.status !== 'paid') {
        return res.status(400).json({ error: `Cannot assign driver to order with status: ${order.status}` });
      }
      
      const driver = await prisma.driver.findUnique({
        where: { id: normalizedDriverId },
        include: { user: true }
      });
      
      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }

      if (!driver.isActive || !['available', 'online'].includes(driver.status)) {
        return res.status(409).json({ error: 'Driver is not available for assignment' });
      }
      

    // ============ CORRECT LOGIC (NOT RECALCULATE) ============
  // Get the order's pre-calculated delivery fee and distance from checkout
      const deliveryFee = Number(order.deliveryFee || 0);
      const merchantToCustomerDistance = getDistanceKmFromMetadata(order.logisticsMetadata, Number(order.distance) || 0);
      
      // Calculate driver's distance to merchant (for display/ETA only)
      let driverDistanceToMerchant = null;
    try {
      const locationRaw = await redis.get(`driver:${normalizedDriverId}:location`);
      if (locationRaw && order.pickupLat && order.pickupLng) {
        const location = JSON.parse(locationRaw.toString());
        const { calculateDistance } = await import('../../utils/distance');
        driverDistanceToMerchant = calculateDistance(
            order.pickupLat,
            order.pickupLng,
            location.lat,
            location.lng
          );

     console.log(`📍 Driver is ${driverDistanceToMerchant.toFixed(2)}km from merchant (for ETA only)`);
        }
      } catch (locError) {
        console.warn('Could not get driver location:', locError);
      }
      
     // Calculate platform fee and driver earning based on PRE-CALCULATED delivery fee
      const platformFee = deliveryFee * 0.15;
      const driverEarning = deliveryFee - platformFee;
      
      console.log(`💰 Delivery Fee Breakdown (from checkout):
        Merchant → Customer Distance: ${merchantToCustomerDistance.toFixed(2)}km
        Delivery Fee: TSh ${deliveryFee.toLocaleString()}
        Platform Fee (15%): TSh ${platformFee.toLocaleString()}
        Driver Earnings: TSh ${driverEarning.toLocaleString()}
        ${driverDistanceToMerchant ? `Driver is ${driverDistanceToMerchant.toFixed(2)}km from merchant` : ''}`);

      // Update order and driver
      const updatedOrder = await prisma.$transaction(async (tx) => {
        const driverClaim = await tx.driver.updateMany({
          where: { id: normalizedDriverId, isActive: true, status: { in: ['available', 'online'] } },
          data: { status: 'busy', isBusy: true }
        });
        if (driverClaim.count !== 1) {
          throw new Error('Driver is no longer available for assignment');
        }

        const orderClaim = await tx.order.updateMany({
          where: { orderId: normalizedOrderId, status: 'paid', driverId: null },
          data: {
            driverId: normalizedDriverId,
            status: 'assigned',
            tripStage: 'assigned',
            distance: merchantToCustomerDistance,
            deliveryFee,
            driverEarning,
            platformFee
          }
        });
        if (orderClaim.count !== 1) {
          await tx.driver.updateMany({
            where: { id: normalizedDriverId, status: 'busy' },
            data: { status: 'available', isBusy: false }
          });
          throw new Error('Order is no longer available for assignment');
        }

        const updated = await tx.order.findUnique({ where: { orderId: normalizedOrderId } });
        
        // Log audit
        await tx.auditLog.create({
          data: {
            adminId,
            action: 'MANUAL_DRIVER_ASSIGNMENT',
            targetType: 'order',
            targetId: normalizedOrderId,
            meta: { 
              driverId: normalizedDriverId, 
              merchantToCustomerDistance, 
              driverDistanceToMerchant,
              deliveryFee 
            }
          }
        });
        
        return updated;
      });
      
      // Notify driver via Socket.io
      const { io } = await import('../../server');

      io.to(normalizedDriverId).emit("order:new", {
        orderId: updatedOrder.orderId,
        amount: updatedOrder.amount,
        status: 'assigned',
        tripStage: 'assigned',
        pickupLat: updatedOrder.pickupLat,
        pickupLng: updatedOrder.pickupLng,
        deliveryLat: updatedOrder.deliveryLat,
        deliveryLng: updatedOrder.deliveryLng,
        deliveryFee: deliveryFee,
        distance: driverDistanceToMerchant || merchantToCustomerDistance,
        merchantName: order.merchant?.businessName || 'Merchant',
        assignedBy: 'admin'
      });

     // Also emit specific assignment event for driver
      io.to(normalizedDriverId).emit("order:assigned", {
  orderId: updatedOrder.orderId,
  amount: updatedOrder.amount,
  status: 'assigned',
  tripStage: 'assigned',
  pickupLat: updatedOrder.pickupLat,
  pickupLng: updatedOrder.pickupLng,
  deliveryLat: updatedOrder.deliveryLat,
  deliveryLng: updatedOrder.deliveryLng,
  deliveryFee: deliveryFee,
  distance: driverDistanceToMerchant || merchantToCustomerDistance,
  driverId: normalizedDriverId,
  merchantName: order.merchant?.businessName || 'Merchant',
  assignedBy: 'admin'
});
        

     // ✅ 2. Emit to CUSTOMER (so order moves from pending to in-progress)
      io.to(`user:${order.userId}`).emit("order:update", {
        orderId: updatedOrder.orderId,
        status: 'assigned',
        tripStage: 'assigned',
        driverName: driver.user?.name,
        driverPhone: driver.user?.phone,
        estimatedArrival: driverDistanceToMerchant !== null ? `${Math.ceil(driverDistanceToMerchant * 3)} minutes` : null
      });
      
     // ✅ 3. Emit to MERCHANT (so they know driver is assigned)
      io.to(`merchant:${order.merchantId}`).emit("order:update", {
        orderId: updatedOrder.orderId,
        status: 'assigned',
        driverName: driver.user?.name,
        driverPhone: driver.user?.phone
      });

     // ✅ 4. Broadcast general update to refresh all dashboards
      io.emit("order:assigned", {
        orderId: updatedOrder.orderId,
        driverId: normalizedDriverId,
        driverName: driver.user?.name
      });

      // Send SMS to driver
      if (driver.user?.phone) {
        const { SMSService } = await import('../../services/sms.service');
        await SMSService.sendRealSMS(
          driver.user.phone,
          `🔔 NEW ORDER ASSIGNED! Order #${updatedOrder.orderId.slice(-8)} - TZS ${deliveryFee.toLocaleString()}\nAccept in app now!`
        );
      }
      
     // ✅ 6. Send SMS to customer
      if (order.user?.phone) {
        const { SMSService } = await import('../../services/sms.service');
        await SMSService.sendRealSMS(
          order.user?.phone,
          `✅ Driver assigned to your order #${updatedOrder.orderId.slice(-8)}!\nDriver: ${driver.user?.name}\nTrack your delivery in the app.`
        );
      }
      
      console.log(`✅ Manual assignment complete: Order ${normalizedOrderId} → Driver ${driverId}`);
      console.log(`📡 Socket events sent to: driver(${normalizedDriverId}), user(${order.userId}), merchant(${order.merchantId})`);
      
      res.json({ success: true, order: updatedOrder });
    } catch (error: any) {
      console.error('Manual assign error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get unassigned orders (admin)
router.get('/unassigned-orders', 
  authMiddleware, 
  requireRole('admin'), 
  async (req: Request, res: Response) => {
    try {
      // Orders that are paid but not assigned
      const orders = await prisma.order.findMany({
        where: {
          status: 'paid',
          driverId: null
        },
        include: {
          user: {
            select: { name: true, phone: true }
          },
          merchant: {
            select: { businessName: true, pickupLat: true, pickupLng: true }
          }
        },
        orderBy: { createdAt: 'asc' }
      });
      
      res.json(orders);
    } catch (error: any) {
      console.error('Unassigned orders error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get pending assignments count (for dashboard)
router.get('/pending-assignments-count', 
  authMiddleware, 
  requireRole('admin'), 
  async (req: Request, res: Response) => {
    try {
      const count = await DriverAssignmentService.getPendingAssignmentsCount();
      res.json({ count });
    } catch (error: any) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// ============ HURIA CARD ADMIN ROUTES ============

// Get all cards
router.get('/cards', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const cards = await prisma.huriaCard.findMany({
      include: {
        user: { select: { name: true, email: true, phone: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const userIds = cards.map(card => card.userId).filter((id): id is string => Boolean(id));
    const pendingSubscriptions = userIds.length
      ? await prisma.subscription.findMany({
          where: { userId: { in: userIds }, status: "pending_payment" },
          select: { userId: true },
          distinct: ["userId"]
        })
      : [];
    const pendingUserIds = new Set(pendingSubscriptions.map(subscription => subscription.userId));
    
    const formattedCards = cards.map(card => ({
      id: card.id,
      cardNumber: card.cardNumber,
      userName: card.user?.name,
      userEmail: card.user?.email,
      userId: card.userId,
      balance: card.balance,
      hcoins: card.hcoins,
      isActive: card.isActive,
      createdAt: card.createdAt,
      hasPendingSubscription: pendingUserIds.has(card.userId)
    }));
    
    res.json(formattedCards);
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get card analytics
router.get('/cards/analytics', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const [totalCards, totalBalance, totalHCoins, activeCards] = await Promise.all([
      prisma.huriaCard.count(),
      prisma.huriaCard.aggregate({ _sum: { balance: true } }),
      prisma.huriaCard.aggregate({ _sum: { hcoins: true } }),
      prisma.huriaCard.count({ where: { isActive: true } })
    ]);
    
    res.json({
      totalCards,
      totalBalance: totalBalance._sum.balance || 0,
      totalHCoins: totalHCoins._sum.hcoins || 0,
      activeCards
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get card transactions
router.get('/cards/transactions', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query.page, req.query.limit, 50, 200);
    
    const [transactions, total] = await Promise.all([
      prisma.cardTransaction.findMany({
        include: { card: { include: { user: { select: { name: true } } } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.cardTransaction.count()
    ]);
    
    const formattedTransactions = transactions.map(tx => ({
      id: tx.id,
      type: tx.type,
      amount: tx.amount,
      hcoinsEarned: tx.hcoinsEarned,
      cashbackAmount: tx.cashbackAmount,
      description: tx.description,
      userName: tx.card?.user?.name,
      createdAt: tx.createdAt
    }));
    
    res.json({ transactions: formattedTransactions, total, page, limit });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Toggle card status
router.patch('/cards/:cardId/status', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const cardId = getParamString(req.params.cardId, "card id");
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "isActive must be a boolean" });
    }
    
    const updated = await prisma.huriaCard.update({
      where: { id: cardId },
      data: { isActive, updatedAt: new Date() }
    });
    
    res.json({ success: true, card: updated });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============ SUBSCRIPTION ADMIN ROUTES ============

// Get subscription analytics
router.get('/subscription/analytics', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const [totalSubscriptions, activeSubscriptions, revenue, byTier, mrr] = await Promise.all([
      prisma.subscription.count(),
      prisma.subscription.count({ where: { status: 'active' } }),
      prisma.subscriptionTransaction.aggregate({ where: { status: 'completed' }, _sum: { amount: true } }),
      prisma.subscription.groupBy({ by: ['tier'], _count: true, where: { status: 'active' } }),
      prisma.subscriptionTransaction.aggregate({ 
        where: { 
          status: 'completed',
          createdAt: { gte: new Date(new Date().setDate(1)) }
        },
        _sum: { amount: true }
      })
    ]);
    
    const byTierMap = {};
    byTier.forEach(item => { byTierMap[item.tier] = item._count; });
    
    res.json({
      totalSubscriptions,
      activeSubscriptions,
      totalRevenue: revenue._sum.amount || 0,
      mrr: mrr._sum.amount || 0,
      byTier: byTierMap
    });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all subscriptions (paginated)
router.get('/subscription/all', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req.query.page, req.query.limit, 50, 200);
    
    const [subscriptions, total] = await Promise.all([
      prisma.subscription.findMany({
        include: { user: { select: { name: true, email: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.subscription.count()
    ]);
    
    const formattedSubs = subscriptions.map(sub => ({
      id: sub.id,
      userId: sub.userId,
      userName: sub.user?.name,
      userEmail: sub.user?.email,
      tier: sub.tier,
      price: sub.price,
      status: sub.status,
      startDate: sub.startDate,
      endDate: sub.endDate,
      autoRenew: sub.autoRenew,
      createdAt: sub.createdAt
    }));
    
    res.json({ subscriptions: formattedSubs, total, page, limit });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Export subscription data
router.get('/subscription/export', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { format = 'csv' } = req.query;
    const subscriptions = await prisma.subscription.findMany({
      include: { user: { select: { name: true, email: true, phone: true } } },
      orderBy: { createdAt: 'desc' }
    });
    
    if (format === 'csv') {
      const headers = ['User Name', 'Email', 'Plan', 'Price', 'Status', 'Start Date', 'End Date', 'Auto Renew', 'Created At'];
      const rows = subscriptions.map(sub => [
        sub.user?.name || '',
        sub.user?.email || '',
        sub.tier,
        sub.price,
        sub.status,
        sub.startDate.toISOString().split('T')[0],
        sub.endDate.toISOString().split('T')[0],
        sub.autoRenew ? 'Yes' : 'No',
        sub.createdAt.toISOString()
      ]);
      
      let csvContent = headers.join(',') + '\n';
      rows.forEach(row => { csvContent += row.map(cell => `"${cell}"`).join(',') + '\n'; });
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=subscriptions_${Date.now()}.csv`);
      res.send(csvContent);
    } else {
      res.json(subscriptions);
    }
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Cancel pending subscription (admin)
router.post('/subscription/cancel-pending/:userId', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const userId = getParamString(req.params.userId, "user id");
    
    const updated = await prisma.subscription.updateMany({
      where: { userId, status: 'pending_payment' },
      data: { status: 'cancelled', autoRenew: false, updatedAt: new Date() }
    });
    
    await prisma.subscriptionTransaction.updateMany({
      where: { userId, status: 'pending' },
      data: { status: 'failed' }
    });
    
    res.json({ success: true, cancelled: updated.count });
  } catch (error) {
    res.status(500).json({ error: "Internal server error" });
  }
});


// Get pending manual dispatch orders (Restaurant & Supermarket)
router.get('/manual-dispatch/pending',
  authMiddleware,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
     const pendingQueue = await prisma.manualDispatchQueue.findMany({
        where: { status: 'pending' },
        include: {
          order: {
            include: {
              user: { select: { name: true, phone: true } },
              merchant: { select: { businessName: true, name: true, phone: true, pickupLat: true, pickupLng: true } }
            }
          }
        },
        orderBy: { createdAt: 'asc' }
      });

   // Format the response
      const formattedOrders = pendingQueue.map(queue => ({
        id: queue.id,
        orderId: queue.orderId,
        merchantId: queue.merchantId,
        merchantType: queue.merchantType,
        status: queue.status,
        createdAt: queue.createdAt,
        finalAmount: queue.order?.finalAmount || queue.order?.amount,
        amount: queue.order?.amount,
        pickupLat: queue.order?.pickupLat,
        pickupLng: queue.order?.pickupLng,
        deliveryLat: queue.order?.deliveryLat,
        deliveryLng: queue.order?.deliveryLng,
        deliveryAddress: queue.order?.deliveryAddress,
        merchant: {
          name: queue.order?.merchant?.businessName || queue.order?.merchant?.name,
          phone: queue.order?.merchant?.phone,
          pickupLat: queue.order?.merchant?.pickupLat,
          pickupLng: queue.order?.merchant?.pickupLng
        },
        customer: {
          name: queue.order?.user?.name,
          phone: queue.order?.user?.phone
        }
      }));

      res.json(formattedOrders);
    } catch (error: any) {
      console.error('Get pending manual dispatch error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Get pending count for dashboard badge
router.get('/manual-dispatch/count',
  authMiddleware,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      const count = await prisma.manualDispatchQueue.count({
        where: { status: 'pending' }
      });
      
      res.json({ count });
    } catch (error: unknown) {
      console.error('Count error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Assign driver to manual dispatch order
router.post('/manual-dispatch/assign',
  authMiddleware,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      const { orderId, driverId } = req.body;
      const adminId = req.user!.id;

      if (typeof orderId !== 'string' || !orderId.trim() || typeof driverId !== 'string' || !driverId.trim()) {
        return res.status(400).json({ error: 'Order ID and Driver ID required' });
      }

      const normalizedOrderId = orderId.trim();
      const normalizedDriverId = driverId.trim();

      // Get order and verify it's in manual dispatch using Prisma
      const manualOrder = await prisma.manualDispatchQueue.findFirst({
        where: { orderId: normalizedOrderId, status: 'pending' }
      });

      if (!manualOrder) {
        return res.status(404).json({ error: 'Order not found in manual dispatch queue' });
      }

      const order = await prisma.order.findUnique({
        where: { orderId: normalizedOrderId },
        include: { user: true, merchant: true }
      });

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const driver = await prisma.driver.findUnique({
        where: { id: normalizedDriverId },
        include: { user: true }
      });

      if (!driver) {
        return res.status(404).json({ error: 'Driver not found' });
      }

      if (!driver.isActive || !['available', 'online'].includes(driver.status)) {
        return res.status(409).json({ error: 'Driver is not available for assignment' });
      }

      // ============ CORRECT LOGIC ============
      // USE PRE-CALCULATED VALUES FROM CHECKOUT (NOT RECALCULATE)
      
      // Get the order's pre-calculated delivery fee and distance from checkout
      const deliveryFee = Number(order.deliveryFee || 0);
      const merchantToCustomerDistance = getDistanceKmFromMetadata(order.logisticsMetadata, Number(order.distance) || 0);
      
      // Calculate driver's distance to merchant (for display/ETA only)
      let driverDistanceToMerchant = null;
      try {
        const locationRaw = await redis.get(`driver:${normalizedDriverId}:location`);
        if (locationRaw && order.pickupLat && order.pickupLng) {
          const location = JSON.parse(locationRaw.toString());
          const { calculateDistance } = await import('../../utils/distance');
          driverDistanceToMerchant = calculateDistance(
            order.pickupLat,
            order.pickupLng,
            location.lat,
            location.lng
          );
          console.log(`📍 Driver is ${driverDistanceToMerchant.toFixed(2)}km from merchant (for ETA only)`);
        }
      } catch (locError) {
        console.warn('Could not get driver location:', locError);
      }
      
      // Calculate platform fee and driver earning based on PRE-CALCULATED delivery fee
      const platformFee = deliveryFee * 0.15;
      const driverEarning = deliveryFee - platformFee;
      
      console.log(`💰 Delivery Fee Breakdown (from checkout):
        Merchant → Customer Distance: ${merchantToCustomerDistance.toFixed(2)}km
        Delivery Fee: TSh ${deliveryFee.toLocaleString()}
        Platform Fee (15%): TSh ${platformFee.toLocaleString()}
        Driver Earnings: TSh ${driverEarning.toLocaleString()}
        ${driverDistanceToMerchant ? `Driver is ${driverDistanceToMerchant.toFixed(2)}km from merchant` : ''}`);

      // Update order and dispatch queue in transaction
      const updatedOrder = await prisma.$transaction(async (tx) => {
        const driverClaim = await tx.driver.updateMany({
          where: { id: normalizedDriverId, isActive: true, status: { in: ['available', 'online'] } },
          data: { status: 'busy', isBusy: true }
        });
        if (driverClaim.count !== 1) {
          throw new Error('Driver is no longer available for assignment');
        }

        const orderClaim = await tx.order.updateMany({
          where: { orderId: normalizedOrderId, status: 'paid', driverId: null },
          data: {
            driverId: normalizedDriverId,
            status: 'assigned',
            tripStage: 'assigned',
            distance: merchantToCustomerDistance,
            deliveryFee,
            driverEarning,
            platformFee
          }
        });
        if (orderClaim.count !== 1) {
          await tx.driver.updateMany({
            where: { id: normalizedDriverId, status: 'busy' },
            data: { status: 'available', isBusy: false }
          });
          throw new Error('Order is no longer available for assignment');
        }

        const updated = await tx.order.findUnique({ where: { orderId: normalizedOrderId } });

        // Update manual dispatch queue
        await tx.manualDispatchQueue.update({
          where: { id: manualOrder.id },
          data: {
            status: 'assigned',
            assignedTo: normalizedDriverId,
            assignedAt: new Date(),
            updatedAt: new Date()
          }
        });

        // Log audit
        await tx.auditLog.create({
          data: {
            adminId,
            action: 'MANUAL_DISPATCH_ASSIGN',
            targetType: 'order',
            targetId: normalizedOrderId,
            meta: { 
              driverId: normalizedDriverId, 
              merchantToCustomerDistance, 
              driverDistanceToMerchant,
              deliveryFee, 
              merchantType: order.merchant?.merchantType 
            }
          }
        });

        return updated;
      });

      // Send real-time notifications
      const { io } = await import('../../server');

      // Notify driver
      io.to(normalizedDriverId).emit("order:assigned", {
        orderId: updatedOrder.orderId,
        amount: updatedOrder.amount,
        status: 'assigned',
        tripStage: 'assigned',
        pickupLat: updatedOrder.pickupLat,
        pickupLng: updatedOrder.pickupLng,
        deliveryLat: updatedOrder.deliveryLat,
        deliveryLng: updatedOrder.deliveryLng,
        deliveryFee: deliveryFee,
        distance: driverDistanceToMerchant || merchantToCustomerDistance,
        merchantName: order.merchant?.businessName || 'Merchant',
        assignedBy: 'admin',
        isManualDispatch: true,
  mustAcceptIn: 60,  // 60 seconds to accept
  requiresAccept: true  // Flag for driver app
      });

      io.to(normalizedDriverId).emit("order:new", {
        orderId: updatedOrder.orderId,
        amount: updatedOrder.amount,
        status: 'assigned',
        tripStage: 'assigned',
        pickupLat: updatedOrder.pickupLat,
        pickupLng: updatedOrder.pickupLng,
        deliveryLat: updatedOrder.deliveryLat,
        deliveryLng: updatedOrder.deliveryLng,
        deliveryFee: deliveryFee,
        distance: driverDistanceToMerchant || merchantToCustomerDistance,
        merchantName: order.merchant?.businessName || 'Merchant'
      });

// 3. Also add to driver's personal room
io.to(`driver:${normalizedDriverId}`).emit("order:assigned", {
        orderId: updatedOrder.orderId,
        amount: updatedOrder.amount,
        status: 'assigned',
        tripStage: 'assigned',
        distance: driverDistanceToMerchant || merchantToCustomerDistance,
        deliveryFee: deliveryFee,
        requiresAccept: true,
        mustAcceptIn: 60
      });

console.log(`📡 Socket events sent to driver ${driverId}: order:assigned, order:new, driver:${driverId}`);

      // Notify customer
      io.to(`user:${order.userId}`).emit("order:update", {
        orderId: updatedOrder.orderId,
        status: 'assigned',
        tripStage: 'assigned',
        driverName: driver.user?.name,
        driverPhone: driver.user?.phone,
        estimatedArrival: driverDistanceToMerchant !== null ? `${Math.ceil(driverDistanceToMerchant * 3)} minutes` : null
      });

      // Notify merchant
      io.to(`merchant:${order.merchantId}`).emit("order:update", {
        orderId: updatedOrder.orderId,
        status: 'assigned',
        driverName: driver.user?.name,
        driverPhone: driver.user?.phone
      });

      // Broadcast to admin dashboard to refresh
      io.emit("admin:manual-dispatch-assigned", {
        orderId,
        driverId: normalizedDriverId,
        driverName: driver.user?.name
      });

      // Send SMS to driver
      if (driver.user?.phone) {
        const { SMSService } = await import('../../services/sms.service');
        await SMSService.sendRealSMS(
          driver.user.phone,
          `🔔 NEW ORDER ASSIGNED! Order #${updatedOrder.orderId.slice(-8)} - TZS ${deliveryFee.toLocaleString()}\nAccept in app now!`
        );
      }

      // Send SMS to customer
      if (order.user?.phone) {
        const { SMSService } = await import('../../services/sms.service');
        await SMSService.sendRealSMS(
          order.user.phone,
          `✅ Driver assigned to your order #${updatedOrder.orderId.slice(-8)}!\nDriver: ${driver.user?.name}\nTrack your delivery in the app.`
        );
      }

      // Send SMS to merchant
      if (order.merchant?.phone) {
        const { SMSService } = await import('../../services/sms.service');
        await SMSService.sendRealSMS(
          order.merchant.phone,
          `🚚 Driver ${driver.user?.name} assigned to order #${orderId.slice(-8)}. They will arrive shortly.`
        );
      }

      console.log(`✅ Manual dispatch complete: Order ${normalizedOrderId} → Driver ${driverId}`);
      
      res.json({ success: true, order: updatedOrder });

    } catch (error: any) {
      console.error('Manual dispatch assign error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Mark manual dispatch order as failed (for admin)
router.post('/manual-dispatch/fail',
  authMiddleware,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      const { orderId, reason } = req.body;
      const adminId = req.user!.id;

      // Find the manual dispatch record first
      const manualOrder = await prisma.manualDispatchQueue.findFirst({
        where: { orderId, status: 'pending' }
      });

      if (!manualOrder) {
        return res.status(404).json({ error: 'Order not found in manual dispatch queue' });
      }

        await prisma.$transaction(async (tx) => {
        await tx.manualDispatchQueue.update({
          where: { id: manualOrder.id },
          data: {
            status: 'failed',
            notes: reason || 'No drivers available',
            updatedAt: new Date()
          }
        });

        await tx.auditLog.create({
          data: {
            adminId,
            action: 'MANUAL_DISPATCH_FAIL',
            targetType: 'order',
            targetId: orderId,
            meta: { reason }
          }
        });
      });

      const { io } = await import('../../server');
      io.emit("admin:manual-dispatch-failed", { orderId, reason });

      res.json({ success: true });

    } catch (error: any) {
      console.error('Manual dispatch fail error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Print order details (for admin after completion)
router.get('/orders/:orderId/print',
  authMiddleware,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      const orderId = getParamString(req.params.orderId, "order id");

      const order = await prisma.order.findUnique({
        where: { orderId },
        select: {
          orderId: true,
          createdAt: true,
          completedAt: true,
          status: true,
          amount: true,
          deliveryFee: true,
          discountAmount: true,
          finalAmount: true,
          deliveryAddress: true,
          pickupAddress: true,
          user: { select: { name: true, phone: true } },
          merchant: { select: { businessName: true, name: true, phone: true } },
          driver: { select: { user: { select: { name: true, phone: true } } } },
          items: { select: { quantity: true, price: true, product: { select: { name: true } } } }
        }
      });

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Log print action
      await prisma.auditLog.create({
        data: {
          adminId: req.user!.id,
          action: 'PRINT_ORDER',
          targetType: 'order',
          targetId: orderId,
          meta: { orderStatus: order.status }
        }
      });

      res.json({
        orderId: order.orderId,
        createdAt: order.createdAt,
        completedAt: order.completedAt,
        status: order.status,
        customer: order.user,
        merchant: order.merchant,
        driver: order.driver,
        items: order.items.map(item => ({
          name: item.product.name,
          quantity: item.quantity,
          price: item.price,
          subtotal: Number(item.price) * item.quantity
        })),
        subtotal: Number(order.amount),
        deliveryFee: Number(order.deliveryFee || 0),
        discountAmount: Number(order.discountAmount || 0),
        finalAmount: Number(order.finalAmount ?? order.amount),
        deliveryAddress: order.deliveryAddress,
        pickupAddress: order.pickupAddress
      });

    } catch (error: any) {
      console.error('Print order error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

router.get('/escalated-orders',
  authMiddleware,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      const escalations = await prisma.adminEscalationQueue.findMany({
        where: { status: { in: ['pending', 'urgent'] } },
        orderBy: { createdAt: 'asc' }
      });
      res.json(escalations);
    } catch (error: any) {
      console.error('Get escalated orders error:', error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);

// Mark merchant as contacted
router.post('/escalated-orders/:orderId/contact',
  authMiddleware,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      const orderId = getParamString(req.params.orderId, "order id");
      const { notes } = req.body;
      const result = await PriorityOrderService.markMerchantNotified(orderId, req.user!.id, typeof notes === "string" ? notes.trim() : undefined);
      res.json(result);
    } catch (error: unknown) {
      console.error('Mark merchant notified error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Reassign order to alternate restaurant
router.post('/escalated-orders/:orderId/reassign',
  authMiddleware,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      const orderId = getParamString(req.params.orderId, "order id");
      const { newMerchantId } = req.body;
      if (typeof newMerchantId !== "string" || !newMerchantId.trim()) {
        return res.status(400).json({ error: "newMerchantId is required" });
      }
      const result = await PriorityOrderService.reassignToAlternateRestaurant(orderId, newMerchantId.trim(), req.user!.id);
      res.json(result);
    } catch (error: unknown) {
      console.error('Reassign escalated order error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Cancel with compensation
router.post('/escalated-orders/:orderId/cancel',
  authMiddleware,
  requireRole('admin'),
  async (req: Request, res: Response) => {
    try {
      const orderId = getParamString(req.params.orderId, "order id");
      const { reason } = req.body;
      if (typeof reason !== "string" || !reason.trim()) {
        return res.status(400).json({ error: "Cancellation reason is required" });
      }
      const result = await PriorityOrderService.cancelWithCompensation(orderId, req.user!.id, reason.trim());
      res.json(result);
    } catch (error: unknown) {
      console.error('Cancel escalated order error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);


router.get('/admin-users', 
  authMiddleware, 
  requireRole('admin'), 
  AdminController.getAdminUsers
);

router.post('/admin-users', 
  authMiddleware, 
  requireRole('admin'), 
  AdminController.createAdminUser
);

router.put('/admin-users/:id/role', 
  authMiddleware, 
  requireRole('admin'), 
  AdminController.updateAdminUserRole
);

router.delete('/admin-users/:id', 
  authMiddleware, 
  requireRole('admin'), 
  AdminController.deleteAdminUser
);


export default router;
