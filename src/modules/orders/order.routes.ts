// src/modules/orders/order.routes.ts

import { Router } from 'express';
import { OrderController } from './order.controller';
import { PriorityOrderService } from "./priorityOrder.service";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { 
  apiRateLimiter, 
  authRateLimiter, 
  paymentRateLimiter 
} from '../../middleware/rateLimit.middleware';
import { prisma } from "../../config/db";
import { SMSService } from '../../services/sms.service';

const router = Router();

// Order routes with rate limiting
router.post('/', 
  authRateLimiter,  // Prevent abuse of order creation
  authMiddleware, 
  requireRole("customer"), 
  OrderController.create
);

router.post('/deliver', authMiddleware, requireRole("driver"), OrderController.deliver);

router.post('/admin/mark-fbu-delivered',
  authMiddleware,
  requireRole('admin'),
  OrderController.markFBUDelivered
);

router.post('/complete', authMiddleware, requireRole("driver"), OrderController.complete);

router.post("/preview", authMiddleware, OrderController.preview);

router.get("/my", authMiddleware, OrderController.getMyOrders);

router.get('/:orderId', authMiddleware, OrderController.get);


router.post('/assign', authMiddleware, requireRole("admin", "driver"), OrderController.assignDriver);

router.get("/:orderId/tracking", 
  apiRateLimiter,  // Prevent excessive tracking requests
  authMiddleware, 
  OrderController.tracking
);

router.post("/checkout", 
  paymentRateLimiter,  // Strict rate limit for payment/checkout
  authMiddleware, 
  requireRole("customer"), 
  OrderController.checkout
);

// Merchant confirms order is ready for pickup
router.post('/:orderId/merchant-confirm', 
  authMiddleware, 
  requireRole("merchant"), 
  OrderController.merchantConfirmOrder
);

// Driver arrived at pickup location
router.post('/:orderId/driver-arrived-pickup', 
  authMiddleware, 
  requireRole("driver"), 
  OrderController.driverArrivedPickup
);

// Driver picked up the order
router.post('/:orderId/pickup', 
  authMiddleware, 
  requireRole("driver"), 
  OrderController.pickupOrder
);

// Driver en route to customer
router.post('/:orderId/en-route', 
  authMiddleware, 
  requireRole("driver"), 
  OrderController.enRouteToCustomer
);

// Get current trip stage for map display
router.get('/:orderId/trip-stage', 
  authMiddleware, 
  OrderController.getTripStage
);


router.get(
 "/merchant/orders",
 authMiddleware,
 requireRole("merchant"),
 OrderController.merchantOrders
);

router.get(
 "/merchant/stats",
 authMiddleware,
 requireRole("merchant"),
 OrderController.merchantStats
);


// GET /api/orders/restaurant/orders - Get all orders for restaurant merchant
router.get("/restaurant/orders", 
  authMiddleware, 
  requireRole("merchant"), 
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });

      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }

      if (merchant.merchantType !== 'RESTAURANT') {
        return res.status(400).json({ error: "Not a restaurant merchant" });
      }

      const orders = await prisma.order.findMany({
        where: {
          merchantId: merchant.id,
          status: { 
            in: ['paid', 'assigned', 'ready_for_pickup', 'completed', 'cancelled'] 
          }
        },
        include: {
          items: {
            include: { product: true }
          },
          user: {
            select: { name: true, phone: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Add acceptance deadline for pending orders
      const processedOrders = orders.map(order => ({
        ...order,
        acceptanceDeadline: order.status === 'paid' 
          ? new Date(order.createdAt.getTime() + 5 * 60 * 1000)
          : null
      }));

      res.json(processedOrders);
    } catch (error: any) {
      console.error("Get restaurant orders error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /api/orders/restaurant/:orderId/accept - Accept restaurant order
router.post("/restaurant/:orderId/accept", 
  authMiddleware, 
  requireRole("merchant"), 
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { orderId } = req.params;
      const { estimatedReadyTime } = req.body;

      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });

      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }

      // ✅ USE PriorityOrderService.acceptOrder
      const result = await PriorityOrderService.acceptOrder(orderId, merchant.id, estimatedReadyTime);
      res.json(result);
    } catch (error: any) {
      console.error("Accept restaurant order error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /api/orders/restaurant/:orderId/reject - Reject restaurant order
router.post("/restaurant/:orderId/reject", 
  authMiddleware, 
  requireRole("merchant"), 
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { orderId } = req.params;
      const { reason } = req.body;

      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });

      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }

      // ✅ USE PriorityOrderService.rejectOrder
      const result = await PriorityOrderService.rejectOrder(orderId, merchant.id, reason);
      res.json(result);
    } catch (error: any) {
      console.error("Reject restaurant order error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /api/orders/restaurant/:orderId/ready - Mark restaurant order as ready for pickup
router.post("/restaurant/:orderId/ready", 
  authMiddleware, 
  requireRole("merchant"), 
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { orderId } = req.params;

      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });

      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }

      // ✅ USE PriorityOrderService.markOrderReady
      const result = await PriorityOrderService.markOrderReady(orderId, merchant.id);
      res.json(result);
    } catch (error: any) {
      console.error("Mark restaurant order ready error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);


router.get("/supermarket/orders", 
  authMiddleware, 
  requireRole("merchant"), 
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });

      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }

      if (merchant.merchantType !== 'SUPERMARKET') {
        return res.status(400).json({ error: "Not a supermarket merchant" });
      }

      const orders = await prisma.order.findMany({
        where: {
          merchantId: merchant.id,
          status: { 
            in: ['paid', 'assigned', 'ready_for_pickup', 'completed', 'cancelled'] 
          }
        },
        include: {
          items: {
            include: { product: true }
          },
          user: {
            select: { name: true, phone: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(orders);
    } catch (error: any) {
      console.error("Get supermarket orders error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// POST /api/orders/supermarket/:orderId/confirm - Supermarket confirms order is ready for pickup
router.post("/supermarket/:orderId/confirm", 
  authMiddleware, 
  requireRole("merchant"), 
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const { orderId } = req.params;

      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });

      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }

       if (merchant.merchantType !== 'SUPERMARKET') {
        return res.status(400).json({ error: "Not a supermarket merchant" });
      }

      const order = await prisma.order.findFirst({
        where: { 
          orderId, 
          merchantId: merchant.id 
        },
        include: { user: true, items: { include: { product: true } } }
      });

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      if (order.status !== 'paid') {
        return res.status(400).json({ error: "Order cannot be confirmed" });
      }

     const productSubtotal = order.items.reduce((sum, item) => sum + (Number(item.price) * item.quantity), 0);

      const updated = await prisma.order.update({
        where: { orderId },
        data: {
          status: 'ready_for_pickup',
          tripStage: 'ready_for_pickup',
          readyForPickupAt: new Date()
        }
      });

      // Notify customer
      const user = await prisma.user.findUnique({
        where: { id: order.userId }
      });
      if (user?.phone) {
        await SMSService.sendRealSMS(
          user.phone,
          `🛍️ Order #${orderId.slice(-8)} is ready for pickup at ${merchant.businessName || merchant.name}! Total: TSh ${productSubtotal.toLocaleString()}`
        );
      }

      // Trigger driver assignment
      const { DriverAssignmentService } = await import('../../services/driverAssignment.service');
      await DriverAssignmentService.startAssignment(orderId);

       console.log(`✅ Supermarket order ${orderId} confirmed by ${merchant.businessName || merchant.name}`);

      res.json({ 
        success: true, 
        order: updated,
        productSubtotal 
      });
    } catch (error: any) {
      console.error("Confirm supermarket order error:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
