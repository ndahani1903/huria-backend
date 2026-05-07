import { Router, Response } from 'express';
import { authMiddleware, AuthRequest } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/role.middleware';
import merchantTierService, { MERCHANT_TIERS } from './tiers.service';
import { prisma } from '../../config/db';

const router = Router();

// Get current tier and benefits
router.get('/current', 
  authMiddleware, 
  requireRole('merchant'), 
 async (req: AuthRequest, res: Response) => {
   try {
    const merchant = await prisma.merchant.findUnique({
      where: { userId: req.user!.id },
      select: { id: true, tier: true },
    });

    if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }

    const benefits = await merchantTierService.getCurrentBenefits(
        merchant.id
      );

      res.json({
        tier: merchant.tier || "bronze",
        benefits,
      });

  } catch (error: any) {
    console.error("CURRENT TIER ERROR:", error);
      res.status(500).json({ error: error.message });
    }
  }
);


// Get upgrade progress
router.get('/upgrade-progress', 
  authMiddleware, 
  requireRole('merchant'), 
  async (req: AuthRequest, res: Response) => {
   try {
   console.log("USER:", req.user)
    const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user!.id },
});

if (!merchant) {
   return res.status(404).json({ error: "Merchant not found" });
}

const progress = await merchantTierService.getUpgradeProgress(merchant.id);

res.json(progress);

  } catch (error: any) {
    console.error("UPGRADE ERROR:", error)
      res.status(500).json({success:false,
         message: error.message});
    }
  }
);

// Get all tier definitions (for info)
router.get('/definitions', 
  authMiddleware, 
  async (_req: AuthRequest, res: Response) => {
    res.json(MERCHANT_TIERS);
  }
);

// Manually trigger tier evaluation (admin only)
router.post('/evaluate/:merchantId', 
  authMiddleware, 
  requireRole('admin'), 
  async (req: AuthRequest, res: Response) => {
   try {
    const { merchantId } = req.params;
    const id = Array.isArray(merchantId) ? merchantId[0] : merchantId;
    const result = await merchantTierService.evaluateAndUpgrade(id);
    res.json(result);
 } catch (error: any) {
      console.error("EVALUATE ERROR:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Bulk evaluate all merchants (admin only - for cron job)
router.post('/evaluate-all', 
  authMiddleware, 
  requireRole('admin'), 
  async (_req: AuthRequest, res: Response) => {
    try {
     const merchants = await prisma.merchant.findMany({
      select: { id: true }
    });
    
    const results = [];
    for (const merchant of merchants) {
      const result = await merchantTierService.evaluateAndUpgrade(merchant.id);
      results.push({ merchantId: merchant.id, ...result });
    }
    
    res.json(results);
  } catch (error: any) {
      console.error("BULK EVALUATE ERROR:", error);
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;