import { Request, Response } from 'express';
import { prisma } from '../../config/db';
import merchantTierService from './tiers.service';
import { MERCHANT_TIERS } from './tiers.service';
import { Decimal } from "@prisma/client/runtime/library";

const toNumber = (v: any) =>
  v instanceof Decimal ? v.toNumber() : Number(v);


export class MerchantController {
   // Get merchant dashboard data
static async getDashboard(req: Request, res: Response) {
  const merchantId = req.user!.merchantId;
  
  const [merchant, tierBenefits, upgradeProgress] = await Promise.all([
    prisma.merchant.findUnique({ where: { id: merchantId } }),
    merchantTierService.getCurrentBenefits(merchantId),
    merchantTierService.getUpgradeProgress(merchantId)
  ]);
  
  res.json({
    merchant,
    currentTier: merchant?.tier,
    tierBenefits,
    upgradeProgress,
    nextTierCommission: upgradeProgress.nextTier ? 
      MERCHANT_TIERS[upgradeProgress.nextTier]?.benefits.commissionRate : null
  });
}
  
    
  // Get merchant's orders
  static async getMyOrders(req: any, res: Response) {
    try {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }
      
      const orders = await prisma.order.findMany({
        where: {
        OR: [
          { merchantId: merchant.id },
          {
            items: {
              some: {
                merchantId: merchant.id
               }
             }
           }
         ]
       },
        include: {
          items: {
            where: { merchantId: merchant.id },
            include: { 
              product: true   // ✅ Only show active products }
          }
         },
         user: true
       },
        orderBy: { createdAt: 'desc' }
      });
      
      res.json(orders);
    } catch (error: any) {
      console.error("Get orders error:", error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Get merchant earnings
  static async getEarnings(req: any, res: Response) {
    try {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }
      
      const orders = await prisma.orderItem.findMany({
        where: { merchantId: merchant.id },
        include: { order: true }
      });
      
      const totalEarnings = orders.reduce((sum, item) => {
        if (item.order.status === 'completed') {
          return sum + (toNumber(item.price) * item.quantity);
        }
        return sum;
      }, 0);
      
      const pendingEarnings = orders.reduce((sum, item) => {
        if (item.order.status === 'paid' || item.order.status === 'assigned') {
          return sum + (toNumber(item.price) * item.quantity);
        }
        return sum;
      }, 0);
      
      res.json({
        totalEarnings,
        pendingEarnings,
        completedOrders: orders.filter(o => o.order.status === 'completed').length,
        pendingOrders: orders.filter(o => o.order.status === 'paid' || o.order.status === 'assigned').length
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}