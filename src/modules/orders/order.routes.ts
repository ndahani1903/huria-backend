import { Router } from 'express';
import { OrderController } from './order.controller';
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { 
  rateLimitMiddleware, 
  authRateLimiter, 
  paymentRateLimiter 
} from '../../middleware/rateLimit.middleware';


const router = Router();

// Order routes with rate limiting
router.post('/', 
  authRateLimiter,  // Prevent abuse of order creation
  authMiddleware, 
  requireRole("customer"), 
  OrderController.create
);

router.post('/deliver', authMiddleware, requireRole("driver"), OrderController.deliver);

router.post('/complete', authMiddleware, requireRole("driver"), OrderController.complete);

router.get("/my", authMiddleware, OrderController.getMyOrders);

router.get('/:orderId', authMiddleware, OrderController.get);


router.post('/assign', authMiddleware, requireRole("admin"), OrderController.assignDriver);

router.get("/:orderId/tracking", 
  rateLimitMiddleware,  // Prevent excessive tracking requests
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


export default router;
