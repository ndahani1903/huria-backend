import { prisma } from "../../config/db";
import { Decimal } from "@prisma/client/runtime/library";

export const toNumber = (val: any): number => {
  if (!val) return 0;
  if (val instanceof Decimal) return val.toNumber();
  return Number(val);
};

interface DriverMetrics {
  weeklyEarnings: number;
  avgPerDelivery: number;
  deliveryCount: number;
  monthsActive: number;
  rating: number;
  completionRate: number;
}

interface DriverEligibilityResult {
  eligible: boolean;
  maxAmount?: number;
  terms?: {
    interestRate: number;
    repaymentPercentage: number;
    estimatedPaybackDays: number;
    dailyRepayment: number;
    totalRepayment: number;
    fees: {
      processing: number;
      lateFee: number;
    };
  };
  reason?: string;
}

export class DriverLendingService {
  private readonly ADVANCE_PERCENTAGE = 0.4; // 40% of monthly earnings (lower than merchant)
  private readonly REPAYMENT_PERCENTAGE = 0.20; // 20% of daily earnings
  private readonly INTEREST_RATE = 0.15; // 15% APR (slightly higher than merchant)
  private readonly MIN_MONTHS_ACTIVE = 2; // 2 months minimum
  private readonly MIN_WEEKLY_EARNINGS = 150000; // TSh 150,000 per week
  private readonly MIN_COMPLETION_RATE = 0.85; // 85% completion rate

  async checkEligibility(driverId: string): Promise<DriverEligibilityResult> {
    const metrics = await this.getDriverMetrics(driverId);
    
    if (metrics.monthsActive < this.MIN_MONTHS_ACTIVE) {
      return { eligible: false, reason: 'Driver not active long enough' };
    }
    
    if (metrics.weeklyEarnings < this.MIN_WEEKLY_EARNINGS) {
      return { eligible: false, reason: 'Weekly earnings below minimum' };
    }
    
    if (metrics.completionRate < this.MIN_COMPLETION_RATE) {
      return { eligible: false, reason: 'Delivery completion rate too low' };
    }
    
    if (metrics.rating < 4.0) {
      return { eligible: false, reason: 'Driver rating below 4.0' };
    }
    
    const monthlyEarnings = metrics.weeklyEarnings * 4;
    const maxAmount = Math.floor(monthlyEarnings * this.ADVANCE_PERCENTAGE);
    const dailyRepayment = Math.floor(metrics.weeklyEarnings * this.REPAYMENT_PERCENTAGE / 7);
    const estimatedPaybackDays = Math.ceil(maxAmount / dailyRepayment);
    
    return {
      eligible: true,
      maxAmount,
      terms: {
        interestRate: this.INTEREST_RATE,
        repaymentPercentage: this.REPAYMENT_PERCENTAGE,
        estimatedPaybackDays,
        dailyRepayment,
        totalRepayment: Math.ceil(maxAmount * (1 + this.INTEREST_RATE)),
        fees: {
          processing: Math.ceil(maxAmount * 0.015), // 1.5% processing fee
          lateFee: 2000 // TSh 2,000 per day
        }
      }
    };
  }

  async requestAdvance(driverId: string, amount: number): Promise<any> {
    const eligibility = await this.checkEligibility(driverId);
    
    if (!eligibility.eligible) {
      throw new Error(`Not eligible: ${eligibility.reason}`);
    }
    
    if (!eligibility.maxAmount || amount > eligibility.maxAmount) {
      throw new Error(`Amount exceeds maximum of TSh ${eligibility.maxAmount}`);
    }
    
    return await prisma.$transaction(async (tx) => {
      // Find driver's wallet
      const wallet = await tx.wallet.findFirst({
        where: { driverId: driverId }
      });
      
      if (!wallet) {
        throw new Error('Wallet not found for driver');
      }
      
      // Create advance record
      const advance = await tx.driverAdvance.create({
        data: {
          driverId,
          amount,
          remainingBalance: amount,
          interestRate: this.INTEREST_RATE,
          repaymentPercentage: this.REPAYMENT_PERCENTAGE,
          status: 'active',
          dailyRepayment: Math.floor(amount * this.REPAYMENT_PERCENTAGE / 30),
          startDate: new Date(),
          expectedEndDate: new Date(Date.now() + 60 * 86400000), // 60 days
          createdAt: new Date()
        }
      });
      
      // Add funds to driver wallet
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: amount } }
      });
      
      // Get current balance first
const currentWallet = await tx.wallet.findUnique({
  where: { id: wallet.id }
});
const newBalance = toNumber(currentWallet?.balance || 0) + amount;

      // Create transaction record
      await tx.transaction.create({
        data: {
          walletId: wallet.id,
          amount,
          type: 'credit',
          balanceAfter: newBalance, 
          reference: advance.id,
          status: 'completed',
          createdAt: new Date()
        }
      });
      
      return advance;
    });
  }

  async processDailyRepayment(driverId: string): Promise<void> {
    const activeAdvance = await prisma.driverAdvance.findFirst({
      where: { driverId, status: 'active' }
    });
    
    if (!activeAdvance) return;
    
    const todayEarnings = await this.getTodayEarnings(driverId);
    const repaymentAmount = Math.min(
      Math.floor(todayEarnings * activeAdvance.repaymentPercentage),
       toNumber(activeAdvance.remainingBalance)
    );
    
    if (repaymentAmount <= 0) return;
    
    await prisma.$transaction(async (tx) => {
      // Find driver's wallet
      const wallet = await tx.wallet.findFirst({
        where: { driverId: driverId }
      });
      
      if (!wallet) return;
      
      // Deduct from driver wallet
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: repaymentAmount } }
      });
      
      // Update advance record
      const newBalance = toNumber(activeAdvance.remainingBalance) - repaymentAmount;
      await tx.driverAdvance.update({
        where: { id: activeAdvance.id },
        data: {
          remainingBalance: newBalance,
          status: newBalance <= 0 ? 'completed' : 'active',
          completedAt: newBalance <= 0 ? new Date() : null
        }
      });
      
      // Record repayment
      if (tx.driverRepayment) {
        await tx.driverRepayment.create({
          data: {
            advanceId: activeAdvance.id,
            amount: repaymentAmount,
            date: new Date(),
            earningsAmount: todayEarnings
          }
        });
      }
    });
  }

  private async getDriverMetrics(driverId: string): Promise<DriverMetrics> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    
    const deliveries = await prisma.order.findMany({
      where: {
        driverId,
        status: 'completed',
        completedAt: { gte: sevenDaysAgo }
      }
    });
    
    const totalEarnings = deliveries.reduce((sum, o) => sum + toNumber(o.driverEarning || 0), 0);
    const deliveryCount = deliveries.length;
    const completedDeliveries = deliveryCount;
    const totalAssigned = await prisma.order.count({
      where: {
        driverId,
        completedAt: { gte: sevenDaysAgo }
      }
    });
    
    // Get driver creation date
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true }
    });
    
    if (!driver) {
      throw new Error('Driver not found');
    }
    
    const monthsActive = Math.max(1, Math.floor((Date.now() - driver.user.createdAt.getTime()) / (30 * 86400000)));
    const completionRate = totalAssigned > 0 ? completedDeliveries / totalAssigned : 0;
    
    return {
      weeklyEarnings: totalEarnings,
      avgPerDelivery: deliveryCount > 0 ? totalEarnings / deliveryCount : 0,
      deliveryCount,
      monthsActive,
      rating: driver.rating || 0,
      completionRate
    };
  }

  private async getTodayEarnings(driverId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const deliveries = await prisma.order.findMany({
      where: {
        driverId,
        status: 'completed',
        completedAt: { gte: today }
      }
    });
    
    return deliveries.reduce((sum, o) => sum + toNumber(o.driverEarning || 0), 0);
  }
}

export default new DriverLendingService();