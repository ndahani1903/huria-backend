import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import ForecastService from '../services/forecast.service';
import { prisma } from '../config/db';
import redis from '../config/redis'; 

const router = Router();

// Get demand forecast default 7 days for merchant only
router.get('/demand',
  authMiddleware,
  requireRole('merchant'),
  async (req: any, res) => {
    try {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });

      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }

      const forecast = await ForecastService.getDemandForecast(merchant.id, 7);
      res.json(forecast);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get demand forecast custom days
router.get('/demand/:days',
  authMiddleware,
  requireRole('merchant'),
  async (req: any, res) => {
    try {
      const days = parseInt(req.params.days) || 7;

      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });

      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }

      const forecast = await ForecastService.getDemandForecast(merchant.id, days);
      res.json(forecast);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);



// Get restock recommendations (merchant only)
router.get('/restock', 
  authMiddleware, 
  requireRole('merchant'), 
  async (req: any, res) => {
    try {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      const recommendations = await ForecastService.getRestockRecommendations(merchant.id);
      res.json(recommendations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get optimal pricing for product (merchant only)
router.post('/pricing', 
  authMiddleware, 
  requireRole('merchant'), 
  async (req: any, res) => {
    try {
      const { productId } = req.body;
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      const pricing = await ForecastService.getOptimalPricing(merchant.id, productId);
      res.json(pricing);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get AI alerts (merchant only)
router.get('/alerts', 
  authMiddleware, 
  requireRole('merchant'), 
  async (req: any, res) => {
    try {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      const alerts = await ForecastService.getAlerts(merchant.id);
      res.json(alerts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Admin: Get batch forecast status
router.get('/admin/status', 
  authMiddleware, 
  requireRole('admin'), 
  async (req, res) => {
     // Check if redis is available
    if (!redis) {
      return res.json({
        status: 'redis_not_available',
        last_run: null,
        merchants_processed: null
      });
    }
    
    const lastRun = await redis.get('forecast:last_run');
    const lastCount = await redis.get('forecast:last_count');

    res.json({
      status: 'running',
      last_run: lastRun,
      merchants_processed: lastCount
    });
  }
);

export default router;