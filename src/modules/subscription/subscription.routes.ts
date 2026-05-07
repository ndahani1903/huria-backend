import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import subscriptionService, { SUBSCRIPTION_TIERS } from './subscription.service';
import { prisma } from '../../config/db';

const router = Router();

// Get available subscription tiers
router.get('/tiers', async (req, res) => {
  const tiers = await subscriptionService.getAvailableTiers();
  res.json(tiers);
});

// Get user's current subscription
router.get('/current', authMiddleware, async (req, res) => {
  const subscription = await subscriptionService.getCurrentSubscription(req.user!.id);
  res.json(subscription || { message: 'No active subscription' });
});

// Subscribe to a tier
router.post('/subscribe', authMiddleware, async (req, res) => {
  try {
    const { tier, paymentMethod } = req.body;
    
    if (!tier || !SUBSCRIPTION_TIERS[tier]) {
      return res.status(400).json({ error: 'Invalid subscription tier' });
    }
    
    const subscription = await subscriptionService.subscribe(req.user!.id, tier, paymentMethod);
    res.json({ success: true, subscription });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

// Cancel subscription
router.post('/cancel', authMiddleware, async (req, res) => {
  await subscriptionService.cancelSubscription(req.user!.id);
  res.json({ success: true, message: 'Subscription cancelled' });
});

// Get subscription history
router.get('/history', authMiddleware, async (req, res) => {
  const history = await prisma.subscription.findMany({
    where: { userId: req.user!.id },
    include: { },
    orderBy: { createdAt: 'desc' }
  });
  res.json(history);
});

// Admin: Get all subscriptions
router.get('/admin/all', authMiddleware, requireRole('admin'), async (req, res) => {
  const subscriptions = await prisma.subscription.findMany({
    include: {
      user: { select: { name: true, email: true, phone: true } },
      transactions: { orderBy: { createdAt: 'desc' }, take: 3 }
    },
    orderBy: { createdAt: 'desc' }
  });
  res.json(subscriptions);
});

// Admin: Get subscription stats
router.get('/admin/stats', authMiddleware, requireRole('admin'), async (req, res) => {
  const [total, active, byTier, revenue] = await Promise.all([
    prisma.subscription.count(),
    prisma.subscription.count({ where: { status: 'active' } }),
    prisma.subscription.groupBy({
      by: ['tier'],
      _count: true,
      where: { status: 'active' }
    }),
    prisma.subscriptionTransaction.aggregate({
      where: { status: 'completed' },
      _sum: { amount: true }
    })
  ]);
  
  res.json({
    totalSubscriptions: total,
    activeSubscriptions: active,
    subscriptionsByTier: byTier,
    totalRevenue: revenue._sum.amount || 0
  });
});

export default router;