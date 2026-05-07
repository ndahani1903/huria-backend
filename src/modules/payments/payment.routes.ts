import { Router } from 'express';
import { PaymentController } from './payment.controller';
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { 
  rateLimitMiddleware, 
  authRateLimiter, 
  paymentRateLimiter 
} from "../../middleware/rateLimit.middleware";

const router = Router();

// Payment routes with rate limiting and authentication
router.post('/stk', 
  authMiddleware, 
  requireRole("customer"), 
  paymentRateLimiter,  // Strict rate limit for payment initiation
  PaymentController.stkPush
);

router.post('/callback', 
  rateLimitMiddleware,  // External callback from payment provider
  PaymentController.callback
);

router.post('/release', 
  authMiddleware, 
  requireRole("driver"), //drivers only can release after delivery
  paymentRateLimiter,
  PaymentController.release
);

router.post('/refund', 
  authMiddleware, 
  requireRole("admin"),  // Only admin can process refunds
  paymentRateLimiter,
  PaymentController.refund
);

router.get('/:orderId', 
  authMiddleware, 
  rateLimitMiddleware,
  PaymentController.getPayment
);

export default router;