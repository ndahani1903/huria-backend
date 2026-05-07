import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import merchantLendingService from './merchantLending.service';
import { prisma } from '../../config/db';
import { toNumber } from "./merchantLending.service"; 

const router = Router();

// Merchant checks eligibility
router.get('/eligibility', 
  authMiddleware, 
  requireRole('merchant'), 
  async (req, res) => {
    try {
      const merchantId = req.user.merchantId || req.user!.id;
      const result = await merchantLendingService.checkEligibility(merchantId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Merchant requests advance
router.post('/request', 
  authMiddleware, 
  requireRole('merchant'), 
  async (req, res) => {
    try {
      const { amount } = req.body;
      const merchantId = req.user.merchantId || req.user!.id;
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
      }
      
      const result = await merchantLendingService.requestAdvance(merchantId, amount);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get merchant's active advance
router.get('/active', 
  authMiddleware, 
  requireRole('merchant'), 
  async (req, res) => {
    try {
      const merchantId = req.user.merchantId || req.user!.id;
      const advance = await prisma.merchantAdvance.findFirst({
        where: { 
          merchantId, 
          status: 'active' 
        },
        include: {
          repayments: {
            orderBy: { date: 'desc' },
            take: 10
          }
        }
      });
      res.json(advance || { message: 'No active advance' });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get merchant's advance history
router.get('/history', 
  authMiddleware, 
  requireRole('merchant'), 
  async (req, res) => {
    try {
      const merchantId = req.user.merchantId || req.user!.id;
      const advances = await prisma.merchantAdvance.findMany({
        where: { merchantId },
        orderBy: { createdAt: 'desc' },
        include: {
          repayments: {
            orderBy: { date: 'desc' }
          }
        }
      });
      res.json(advances);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Admin routes for merchant lending

// Get all merchant advances (admin only)
router.get('/admin/all', 
  authMiddleware, 
  requireRole('admin'), 
  async (req, res) => {
    try {
      const advances = await prisma.merchantAdvance.findMany({
        include: {
          merchant: {
            include: {
              user: {
                select: { name: true, email: true, phone: true }
              }
            }
          },
          repayments: {
            orderBy: { date: 'desc' },
            take: 5
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      res.json(advances);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Admin get advance by ID
router.get('/admin/:advanceId', 
  authMiddleware, 
  requireRole('admin'), 
  async (req, res) => {
    try {
      const advanceId = req.params.advanceId;
const id = Array.isArray(advanceId) ? advanceId[0] : advanceId;
      const advance = await prisma.merchantAdvance.findUnique({
        where: { id: id  },
        include: {
          merchant: {
            include: {
              user: {
                select: { name: true, email: true, phone: true }
              }
            }
          },
          repayments: true
        }
      });
      
      if (!advance) {
        return res.status(404).json({ error: 'Advance not found' });
      }
      
      res.json(advance);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Admin update advance status (approve/reject/complete)
router.put('/admin/:advanceId/status',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    try {
      const advanceIdParam = req.params.advanceId;
      const id = Array.isArray(advanceIdParam)
        ? advanceIdParam[0]
        : advanceIdParam;

      const { status } = req.body;
      
      const advance = await prisma.merchantAdvance.update({
        where: { id },
        data: {
          status,
          completedAt: status === 'completed' ? new Date() : null
        }
      });
      
      res.json(advance);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get lending statistics (admin only)
router.get('/admin/stats', 
  authMiddleware, 
  requireRole('admin'), 
  async (req, res) => {
    try {
      const [totalAdvances, activeAdvances, completedAdvances, totalAmount] = await Promise.all([
        prisma.merchantAdvance.count(),
        prisma.merchantAdvance.count({ where: { status: 'active' } }),
        prisma.merchantAdvance.count({ where: { status: 'completed' } }),
        prisma.merchantAdvance.aggregate({
          _sum: { amount: true }
        })
      ]);
      
      const totalRepaid = await prisma.repayment.aggregate({
        _sum: { amount: true }
      });
      
      res.json({
        totalAdvances,
        activeAdvances,
        completedAdvances,
        defaultedAdvances: totalAdvances - activeAdvances - completedAdvances,
        totalAmountDisbursed: totalAmount._sum.amount || 0,
        totalAmountRepaid: totalRepaid._sum.amount || 0,
        outstandingAmount: toNumber(totalAmount._sum.amount) -
  toNumber(totalRepaid._sum.amount),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;