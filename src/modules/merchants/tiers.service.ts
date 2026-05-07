import { prisma } from "../../config/db";
import { Decimal } from "@prisma/client/runtime/library";

export const toNumber = (val: any): number => {
  if (!val) return 0;
  if (val instanceof Decimal) return val.toNumber();
  return Number(val);
};

export interface MerchantTier {
  name: string;
  requirements: {
    monthlyRevenue: number;
    orderCount: number;
    rating: number;
    monthsActive: number;
  };
  benefits: {
    commissionRate: number;
    features: string[];
    support: string;
    analytics: string[];
    perks: string[];
  };
}

export const MERCHANT_TIERS: Record<string, MerchantTier> = {
  basic: {
    name: 'Basic',
    requirements: {
      monthlyRevenue: 0,
      orderCount: 0,
      rating: 0,
      monthsActive: 0
    },
    benefits: {
      commissionRate: 0.05,
      features: ['basic_analytics', 'product_management', 'order_management'],
      support: 'email',
      analytics: ['daily_sales', 'top_products'],
      perks: []
    }
  },
  pro: {
    name: 'Pro',
    requirements: {
      monthlyRevenue: 2000000, // TSh 2M
      orderCount: 100,
      rating: 4.5,
      monthsActive: 3
    },
    benefits: {
      commissionRate: 0.03,
      features: ['advanced_analytics', 'priority_support', 'api_access', 'bulk_upload'],
      support: 'priority_email + chat',
      analytics: ['customer_insights', 'demand_forecast', 'competitor_pricing'],
      perks: ['free_delivery_promo', 'featured_listing']
    }
  },
  enterprise: {
    name: 'Enterprise',
    requirements: {
      monthlyRevenue: 10000000, // TSh 10M
      orderCount: 500,
      rating: 4.8,
      monthsActive: 6
    },
    benefits: {
      commissionRate: 0.02,
      features: ['white_label', 'custom_integration', 'dedicated_manager', 'custom_reports'],
      support: '24/7 dedicated account manager',
      analytics: ['predictive_analytics', 'customer_lifetime_value', 'inventory_optimization'],
      perks: ['free_advertising', 'spotlight_position', 'cash_advance_eligibility']
    }
  }
};

interface MetricsResult {
  monthlyRevenue: number;
  orderCount: number;
  rating: number;
  monthsActive: number;
}

export class MerchantTierService {
  async evaluateAndUpgrade(merchantId: string): Promise<{ tier: string; upgraded: boolean }> {
    const metrics = await this.getMerchantMetrics(merchantId);
    const currentTier = await this.getCurrentTier(merchantId);
    
    let newTier = 'basic';
    
    if (this.meetsRequirements(metrics, MERCHANT_TIERS.enterprise.requirements)) {
      newTier = 'enterprise';
    } else if (this.meetsRequirements(metrics, MERCHANT_TIERS.pro.requirements)) {
      newTier = 'pro';
    }
    
    const upgraded = newTier !== currentTier;
    
    if (upgraded) {
      await this.upgradeTier(merchantId, newTier);
      await this.notifyMerchant(merchantId, newTier);
    }
    
    return { tier: newTier, upgraded };
  }

  async getCurrentBenefits(merchantId: string): Promise<MerchantTier['benefits'] | null> {
    const tier = await this.getCurrentTier(merchantId);
    return MERCHANT_TIERS[tier]?.benefits || null;
  }

  async getUpgradeProgress(merchantId: string): Promise<{
    currentTier: string;
    nextTier: string | null;
    progress: Record<string, { current: number; required: number; met: boolean }>;
  }> {
    const metrics = await this.getMerchantMetrics(merchantId);
    const currentTier = await this.getCurrentTier(merchantId);
    
    let nextTier: string | null = null;
    let requirements = null;
    
    if (currentTier === 'basic') {
      nextTier = 'pro';
      requirements = MERCHANT_TIERS.pro.requirements;
    } else if (currentTier === 'pro') {
      nextTier = 'enterprise';
      requirements = MERCHANT_TIERS.enterprise.requirements;
    }
    
    const progress = {
      monthlyRevenue: {
        current: metrics.monthlyRevenue,
        required: requirements?.monthlyRevenue || 0,
        met: requirements ? metrics.monthlyRevenue >= requirements.monthlyRevenue : false
      },
      orderCount: {
        current: metrics.orderCount,
        required: requirements?.orderCount || 0,
        met: requirements ? metrics.orderCount >= requirements.orderCount : false
      },
      rating: {
        current: metrics.rating,
        required: requirements?.rating || 0,
        met: requirements ? metrics.rating >= requirements.rating : false
      },
      monthsActive: {
        current: metrics.monthsActive,
        required: requirements?.monthsActive || 0,
        met: requirements ? metrics.monthsActive >= requirements.monthsActive : false
      }
    };
    
    return {
      currentTier,
      nextTier,
      progress
    };
  }

  private meetsRequirements(metrics: MetricsResult, requirements: MerchantTier['requirements']): boolean {
    return (
      metrics.monthlyRevenue >= requirements.monthlyRevenue &&
      metrics.orderCount >= requirements.orderCount &&
      metrics.rating >= requirements.rating &&
      metrics.monthsActive >= requirements.monthsActive
    );
  }

  private async upgradeTier(merchantId: string, newTier: string): Promise<void> {
    // Update merchant tier
    await prisma.merchant.update({
      where: { id: merchantId },
      data: { tier: newTier }
    });
    
   // Apply new commission rate (if merchant has commissionRate field)
    const commissionRate = MERCHANT_TIERS[newTier].benefits.commissionRate;
    
    // Option 1: If commissionRate is in Merchant model
    await prisma.merchant.update({
      where: { id: merchantId },
      data: { commissionRate }
    });
    
  }

  private async getMerchantMetrics(merchantId: string): Promise<MetricsResult> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    
    const [orders, merchant] = await Promise.all([
      prisma.order.findMany({
        where: {
          merchantId,
          status: 'completed',
          createdAt: { gte: thirtyDaysAgo }
        }
      }),
      prisma.merchant.findUnique({
        where: { id: merchantId },
        include: { user: true }
      })
    ]);
    
    if (!merchant) {
      throw new Error('Merchant not found');
    }

    const totalRevenue = orders.reduce((sum, o) => sum + toNumber(o.amount || 0), 0);
    const monthsActive = Math.max(1, Math.floor((Date.now() - merchant.user.createdAt.getTime()) / (30 * 86400000)));
    
    return {
      monthlyRevenue: totalRevenue,
      orderCount: orders.length,
      rating: merchant.rating || 0,
      monthsActive
    };
  }

  private async getCurrentTier(merchantId: string): Promise<string> {
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { tier: true }
    });
    return merchant?.tier || 'basic';
  }

  private async notifyMerchant(merchantId: string, newTier: string): Promise<void> {
    try {
      await prisma.notification.create({
        data: {
          userId: merchantId,
          type: 'tier_upgrade',
          title: `Congratulations! You've been upgraded to ${newTier} tier!`,
          message: `Enjoy ${MERCHANT_TIERS[newTier].benefits.commissionRate * 100}% commission rate and premium features.`,
          data: { newTier, benefits: MERCHANT_TIERS[newTier].benefits },
          createdAt: new Date()
        }
      });
    } catch (error) {
      // Option 2: Just log if notification model doesn't exist
      console.log(`Merchant ${merchantId} upgraded to ${newTier} tier`);
    }
  }
}

export default new MerchantTierService();