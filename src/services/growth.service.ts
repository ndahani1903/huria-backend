import { prisma } from '../config/db';

export class GrowthEngine {
  // Referral Program
  async processReferral(referrerId: string, refereeId: string) {
    await prisma.$transaction(async (tx) => {
      // Give referrer discount
      await tx.wallet.update({
        where: { userId: referrerId },
        data: { balance: { increment: 5.00 } }
      });
      
      // Give referee welcome bonus
      await tx.wallet.update({
        where: { userId: refereeId },
        data: { balance: { increment: 2.50 } }
      });
      
      // Create referral record
      console.log('Referral recorded', { referrerId, refereeId });
    });
  }

  // Dynamic Pricing Engine
  calculateSurgePricing(basePrice: number, demand: number, supply: number): number {
    const surgeMultiplier = Math.min(
      Math.max((demand / Math.max(supply, 1)) * 1.5, 1.0),
      3.0
    );
    
    return Math.round(basePrice * surgeMultiplier * 100) / 100;
  }

  // Smart Notifications
  async sendPersonalizedOffers(userId: string) {
    const userBehavior = await this.analyzeUserBehavior(userId);
    
    const offers = [];
    
    if (userBehavior.lastOrderDays > 7) {
      offers.push({
        type: 'reactivation',
        discount: 20,
        message: "We miss you! Get 20% off your next order"
      });
    }
    
    if (userBehavior.cartAbandonmentCount > 2) {
      offers.push({
        type: 'cart_recovery',
        discount: 10,
        message: "Complete your purchase and save 10%"
      });
    }
    
    return offers;
  }

  private async analyzeUserBehavior(userId: string) {
    const [lastOrder, cartAbandonments] = await Promise.all([
      prisma.order.findFirst({
        where: { userId, status: 'completed' },
        orderBy: { createdAt: 'desc' }
      }),
     /* prisma.cartAbandonment.count({
        where: { userId, createdAt: { gte: new Date(Date.now() - 30 * 86400000) } }
      })*/
Promise.resolve(0)
    ]);

    return {
      lastOrderDays: lastOrder ? Math.floor((Date.now() - lastOrder.createdAt.getTime()) / 86400000) : 999,
      cartAbandonmentCount: cartAbandonments
    };
  }
}