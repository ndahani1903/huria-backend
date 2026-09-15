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

// In payment.routes.ts - add at the top
router.get('/test', (req, res) => {
  res.json({ message: 'Payment routes are working!' });
});

// ✅ Payment initiation - Customer only
router.post('/stk', 
  authMiddleware, 
  requireRole("customer"), 
  paymentRateLimiter,
  PaymentController.stkPush
);

// ✅ Payment status polling - Anyone with auth
router.get('/status/:orderId', 
  authMiddleware, 
  rateLimitMiddleware,
  PaymentController.getPaymentStatus
);

// ✅ M-Pesa callback - No auth (external)
router.post('/callback', 
  rateLimitMiddleware,
  PaymentController.callback
);

// ✅ Release payment after OTP - Driver only
router.post('/release', 
  authMiddleware, 
  requireRole("driver"),
  paymentRateLimiter,
  PaymentController.release
);

// ✅ Refund payment - Admin only
router.post('/refund', 
  authMiddleware, 
  requireRole("admin"),
  paymentRateLimiter,
  PaymentController.refund
);

// ✅ Get payment details
router.get('/:orderId', 
  authMiddleware, 
  rateLimitMiddleware,
  PaymentController.getPayment
);

// ✅ Admin: Retry failed webhook
router.post('/webhook/retry/:eventId', 
  authMiddleware, 
  requireRole("admin"),
  PaymentController.retryWebhook
);

// ✅ Admin: View pending webhooks
router.get('/webhook/pending', 
  authMiddleware, 
  requireRole("admin"),
  PaymentController.getPendingWebhooks
);

export default router;