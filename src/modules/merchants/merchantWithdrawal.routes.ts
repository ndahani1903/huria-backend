import { Router } from 'express';
import { MerchantWithdrawalController } from './merchantWithdrawal.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import { rateLimitMiddleware } from '../../middleware/rateLimit.middleware';
import {
  withdrawalRateLimiter,
  apiRateLimiter,
  adminRateLimiter
} from '../../middleware/rateLimit.middleware';
import { prisma } from '../../config/db';

const router = Router();

// ============ MERCHANT ENDPOINTS ============

// Request withdrawal
router.post('/request',
  authMiddleware,
  requireRole('merchant'),
  withdrawalRateLimiter,
  MerchantWithdrawalController.requestWithdrawal
);

// Get withdrawal history
router.get('/history',
  authMiddleware,
  requireRole('merchant'),
  apiRateLimiter,
  MerchantWithdrawalController.getWithdrawalHistory
);

// Get withdrawal limits
router.get('/limits',
  authMiddleware,
  requireRole('merchant'),
  apiRateLimiter,
  MerchantWithdrawalController.getWithdrawalLimits
);

// ============ ADMIN ENDPOINTS ============

// Get all pending withdrawals
router.get('/admin/pending',
  authMiddleware,
  requireRole('admin'),
  adminRateLimiter,
  MerchantWithdrawalController.getPendingWithdrawals
);

router.get('/admin/all',
  authMiddleware,
  requireRole('admin'),
  async (req: any, res: any) => {
    try {
      const withdrawals = await prisma.merchantWithdrawal.findMany({
        include: {
          merchant: {
            include: { user: { select: { name: true, email: true, phone: true } } }
          },
          wallet: true
        },
        orderBy: { createdAt: 'desc' }
      });
      res.json(withdrawals);
    } catch (error: any) {
      console.error('Get all withdrawals error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);


// Approve withdrawal
router.post('/admin/:id/approve',
  authMiddleware,
  requireRole('admin'),
  adminRateLimiter,
  MerchantWithdrawalController.approveWithdrawal
);

// Reject withdrawal
router.post('/admin/:id/reject',
  authMiddleware,
  requireRole('admin'),
  adminRateLimiter,
  MerchantWithdrawalController.rejectWithdrawal
);

// Mark as completed (payment sent)
router.post('/admin/:id/complete',
  authMiddleware,
  requireRole('admin'),
  adminRateLimiter,
  MerchantWithdrawalController.markAsCompleted
);

export default router;