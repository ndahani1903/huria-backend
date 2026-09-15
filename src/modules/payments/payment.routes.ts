import { Router } from 'express';
import { PaymentController } from './payment.controller';
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { 
  rateLimitMiddleware, 
  authRateLimiter, 
  paymentRateLimiter 
} from "../../middleware/rateLimit.middleware";
import { prisma } from '../../config/db';

const router = Router();

// In payment.routes.ts - add at the top
router.get('/test', (req, res) => {
  res.json({ message: 'Payment routes are working!' });
});


// In payment.routes.ts - TESTING ONLY
router.post('/manual-confirm-order', 
  authMiddleware, 
  requireRole("admin"),
  PaymentController.manualConfirmByOrderId
);

// DEBUG: Get payment metadata to find transaction ID
router.get('/debug/payment/:orderId', authMiddleware, requireRole("admin"), async (req, res) => {
  const { orderId } = req.params;
  
  const payment = await prisma.payment.findFirst({
    where: { orderId },
    select: { id: true, orderId: true, status: true, metadata: true }
  });
  
  res.json({
    payment,
    azamPayTransactionId: payment?.metadata?.azamPayTransactionId,
    provider: payment?.metadata?.provider
  });
});



// ✅ AZAMPAY ROUTES (Payment initiation - Customer only)
router.post('/azampay/initiate', 
  authMiddleware, 
  requireRole("customer"), 
  paymentRateLimiter,
  PaymentController.initiateAzamPayPayment
);

router.post(
  "/card/pay-order",
  authMiddleware, 
  requireRole("customer"), 
  paymentRateLimiter,
  PaymentController.payOrderWithCard
);

router.post('/webhook/azampay', 
  rateLimitMiddleware,
  PaymentController.azamPayWebhook
);

router.get('/azampay/status/:transactionId', 
  authMiddleware, 
  rateLimitMiddleware,
  PaymentController.checkAzamPayStatus
);

// ✅ GENERAL PAYMENT ROUTES
router.get('/status/:orderId', 
  authMiddleware, 
  rateLimitMiddleware,
  PaymentController.getPaymentStatus
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

router.get(
  '/refund-status/:orderId',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { orderId } = req.params;

      const payment = await prisma.payment.findUnique({
        where: { orderId },
        include: {
          refunds: true
        }
      });

      if (!payment) {
        return res.status(404).json({
          error: 'Payment not found'
        });
      }

      res.json({
        paymentStatus: payment.status,
        refunds: payment.refunds
      });

    } catch (error: any) {
      res.status(500).json({
        error: error.message
      });
    }
  }
);

// ✅ Get payment details
router.get('/:orderId', 
  authMiddleware, 
  rateLimitMiddleware,
  PaymentController.getPayment
);


export default router;