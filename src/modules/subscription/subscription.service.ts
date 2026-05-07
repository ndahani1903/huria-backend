import { prisma } from "../../config/db";
import { Decimal } from "@prisma/client/runtime/library";

interface SubscriptionTier {
  name: string;
  price: number; // Monthly in TSh
  benefits: {
    freeDelivery: boolean;
    discountPercentage: number;
    prioritySupport: boolean;
    monthlyCredits: number;
    exclusiveAccess: boolean;
    earlyAccess: boolean;
  };
}

export const SUBSCRIPTION_TIERS: Record<string, SubscriptionTier> = {
  basic: {
    name: 'HURIA Basic',
    price: 5000,
    benefits: {
      freeDelivery: true,
      discountPercentage: 5,
      prioritySupport: false,
      monthlyCredits: 0,
      exclusiveAccess: false,
      earlyAccess: false
    }
  },
  plus: {
    name: 'HURIA Plus',
    price: 15000,
    benefits: {
      freeDelivery: true,
      discountPercentage: 10,
      prioritySupport: true,
      monthlyCredits: 5000,
      exclusiveAccess: true,
      earlyAccess: false
    }
  },
  premium: {
    name: 'HURIA Premium',
    price: 30000,
    benefits: {
      freeDelivery: true,
      discountPercentage: 15,
      prioritySupport: true,
      monthlyCredits: 15000,
      exclusiveAccess: true,
      earlyAccess: true
    }
  }
};

export class SubscriptionService {
  async subscribe(userId: string, tier: string, paymentMethod: string): Promise<any> {
    const subscription = SUBSCRIPTION_TIERS[tier];
    if (!subscription) throw new Error('Invalid subscription tier');
    
    return await prisma.$transaction(async (tx) => {
      // Cancel existing subscription
      await this.cancelSubscription(userId);
      
      // Create new subscription
      const newSubscription = await tx.subscription.create({
        data: {
          userId,
          tier,
          price: subscription.price,
          status: 'active',
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 86400000),
          autoRenew: true,
          paymentMethod,
          createdAt: new Date()
        }
      });
      
      // Process payment
      await this.processSubscriptionPayment(userId, subscription.price);
      
      // Record transaction
      await tx.subscriptionTransaction.create({
        data: {
          subscriptionId: newSubscription.id,
          userId,
          amount: subscription.price,
          status: 'completed',
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 30 * 86400000),
          createdAt: new Date()
        }
      });
      
      // Apply welcome benefits
      await this.applyWelcomeBenefits(userId, tier);
      
      return newSubscription;
    });
  }

  async getCurrentSubscription(userId: string): Promise<any> {
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: 'active',
        startDate: { lte: new Date() },
        endDate: { gte: new Date() }
      },
      include: { }
    });
    
    if (!subscription) return null;
    
    const benefits = SUBSCRIPTION_TIERS[subscription.tier]?.benefits;
    const daysRemaining = Math.ceil((subscription.endDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    
    return {
      ...subscription,
      benefits,
      daysRemaining,
      tierInfo: SUBSCRIPTION_TIERS[subscription.tier]
    };
  }

  async processMonthlyRenewals(): Promise<void> {
    const expiringSubscriptions = await prisma.subscription.findMany({
      where: {
        status: 'active',
        autoRenew: true,
        endDate: { lte: new Date(Date.now() + 24 * 3600000) } // Next 24 hours
      }
    });
    
    for (const sub of expiringSubscriptions) {
      try {
        await this.processSubscriptionPayment(sub.userId, Number(sub.price));
        
        const newEndDate = new Date(sub.endDate);
        newEndDate.setDate(newEndDate.getDate() + 30);
        
        await prisma.subscription.update({
          where: { id: sub.id },
          data: {
            startDate: sub.endDate,
            endDate: newEndDate,
            updatedAt: new Date()
          }
        });
        
        // Record transaction
        await prisma.subscriptionTransaction.create({
          data: {
            subscriptionId: sub.id,
            userId: sub.userId,
            amount: sub.price,
            status: 'completed',
            periodStart: sub.endDate,
            periodEnd: newEndDate,
            createdAt: new Date()
          }
        });
        
        // Apply monthly credits
        const tier = SUBSCRIPTION_TIERS[sub.tier];
        if (tier.benefits.monthlyCredits > 0) {
          await this.addMonthlyCredits(sub.userId, tier.benefits.monthlyCredits);
        }
      } catch (error) {
        console.error(`Failed to renew subscription ${sub.id}:`, error);
        
        await prisma.subscription.update({
          where: { id: sub.id },
          data: { status: 'failed', updatedAt: new Date() }
        });
      }
    }
  }

  async applySubscriptionBenefits(order: any, userId: string): Promise<any> {
    const subscription = await prisma.subscription.findFirst({
      where: {
        userId,
        status: 'active',
        startDate: { lte: new Date() },
        endDate: { gte: new Date() }
      }
    });
    
    if (!subscription) return order;
    
    const benefits = SUBSCRIPTION_TIERS[subscription.tier]?.benefits;
    if (!benefits) return order;
    
    const updatedOrder = { ...order };
    
    // Apply free delivery
    if (benefits.freeDelivery) {
      updatedOrder.deliveryFee = 0;
    }
    
    // Apply discount
    if (benefits.discountPercentage > 0) {
      updatedOrder.discountPercentage = benefits.discountPercentage;
      updatedOrder.discountAmount = (order.amount || 0) * (benefits.discountPercentage / 100);
      updatedOrder.finalAmount = (order.amount || 0) - updatedOrder.discountAmount;
    }
    
    // Check for welcome discount first order
    const welcomePromo = await prisma.userPromotion.findFirst({
      where: {
        userId,
        type: 'welcome_discount',
        used: false,
        expiresAt: { gte: new Date() }
      }
    });
    
    if (welcomePromo && !updatedOrder.discountApplied) {
      updatedOrder.welcomeDiscount = welcomePromo.value;
      updatedOrder.finalAmount = (updatedOrder.finalAmount || order.amount) * (1 - welcomePromo.value / 100);
      updatedOrder.discountApplied = true;
      
      // Mark as used
      await prisma.userPromotion.update({
        where: { id: welcomePromo.id },
        data: { used: true }
      });
    }
    
    return updatedOrder;
  }

  async cancelSubscription(userId: string): Promise<void> {
    await prisma.subscription.updateMany({
      where: { userId, status: 'active' },
      data: { status: 'cancelled', autoRenew: false, updatedAt: new Date() }
    });
  }

  async getAvailableTiers(): Promise<any[]> {
    return Object.entries(SUBSCRIPTION_TIERS).map(([key, value]) => ({
      id: key,
      name: value.name,
      price: value.price,
      benefits: value.benefits
    }));
  }

  private async processSubscriptionPayment(userId: string, amount: number): Promise<void> {
    const wallet = await prisma.wallet.findFirst({
      where: { userId }
    });
    
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    if (new Decimal(wallet.balance).lessThan(amount)) {
      throw new Error('Insufficient funds for subscription');
    }
    
    await prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: { decrement: amount } }
    });
    
const currentBalance = wallet?.balance || 0;
    // Record transaction
    await prisma.transaction.create({
      data: {
        walletId: wallet.id,
        amount,
        type: 'debit',
        balanceAfter: Number(currentBalance) - amount, 
        status: 'completed',
        createdAt: new Date()
      }
    });
  }

private async addMonthlyCredits(userId: string, credits: number): Promise<void> {
  const wallet = await prisma.wallet.findFirst({
    where: { userId }
  });
  
  if (wallet) {
    await prisma.$transaction(async (tx) => {
      const updatedWallet = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: credits } }
      });
      
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          amount: credits,
          type: 'credit',
          balanceAfter: updatedWallet.balance,
          status: 'completed',
          createdAt: new Date()
        }
      });
    });
  }
}

  private async applyWelcomeBenefits(userId: string, tier: string): Promise<void> {
    const benefits = SUBSCRIPTION_TIERS[tier]?.benefits;
    if (!benefits) return;
    
    // Apply welcome discount on next order
    await prisma.userPromotion.create({
      data: {
        userId,
        type: 'welcome_discount',
        value: benefits.discountPercentage,
        expiresAt: new Date(Date.now() + 30 * 86400000),
        createdAt: new Date()
      }
    });
    
    // Send welcome notification
    try {
      await prisma.notification.create({
        data: {
          userId,
          type: 'subscription_welcome',
          title: `Welcome to ${SUBSCRIPTION_TIERS[tier].name}!`,
          message: `You're now enjoying ${benefits.discountPercentage}% off all orders and free delivery.`,
          data: { tier, benefits },
          createdAt: new Date()
        }
      });
    } catch (error) {
      console.log(`Welcome notification for ${userId} skipped - notification model may not exist`);
    }
  }
}

export default new SubscriptionService();