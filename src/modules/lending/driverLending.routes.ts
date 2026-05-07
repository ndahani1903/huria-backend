import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import driverLendingService from './driverLending.service';
import { prisma } from '../../config/db';

const router = Router();

// Driver checks eligibility
router.get('/eligibility', 
  authMiddleware, 
  requireRole('driver'), 
  async (req, res) => {
    const result = await driverLendingService.checkEligibility(req.user!.id);
    res.json(result);
  }
);

// Driver requests advance
router.post('/request', 
  authMiddleware, 
  requireRole('driver'), 
  async (req, res) => {
    const { amount } = req.body;
    const result = await driverLendingService.requestAdvance(req.user.id, amount);
    res.json(result);
  }
);

// Admin/view all driver advances
router.get('/all', 
  authMiddleware, 
  requireRole('admin'), 
  async (req, res) => {
    const advances = await prisma.driverAdvance.findMany({
      include: { driver: { include: { user: true } } }
    });
    res.json(advances);
  }
);

export default router;