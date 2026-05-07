import { prisma } from "../../config/db";
import axios from 'axios';
import { Decimal } from "@prisma/client/runtime/library";

export const toNumber = (val: any): number => {
  if (!val) return 0;
  if (val instanceof Decimal) return val.toNumber();
  return Number(val);
};

interface MerchantMetrics {
  monthlyRevenue: number;
  avgOrderValue: number;
  orderCount: number;
  monthsActive: number;
  rating: number;
  refundRate: number;
}

interface EligibilityResult {
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

interface AdvanceResult {
  id: string;
  merchantId: string;
  amount: number;
  remainingBalance: number;
  interestRate: number;
  repaymentPercentage: number;
  status: string;
  dailyRepayment: number;
  startDate: Date;
  expectedEndDate: Date;
  createdAt: Date;
}

export class MerchantLendingService {
  private readonly ADVANCE_PERCENTAGE = 0.5; // 50% of monthly revenue
  private readonly REPAYMENT_PERCENTAGE = 0.15; // 15% of daily sales
  private readonly INTEREST_RATE = 0.129; // 12.9% APR
  private readonly MIN_MONTHS_ACTIVE = 3;
  private readonly MIN_MONTHLY_REVENUE = 500000; // TSh 500,000

  async checkEligibility(merchantId: string): Promise<EligibilityResult> {
    const metrics = await this.getMerchantMetrics(merchantId);
    
    if (metrics.monthsActive < this.MIN_MONTHS_ACTIVE) {
      return { eligible: false, reason: 'Merchant not active long enough' };
    }
    
    if (metrics.monthlyRevenue < this.MIN_MONTHLY_REVENUE) {
      return { eligible: false, reason: 'Monthly revenue below minimum' };
    }
    
    if (metrics.refundRate > 0.1) {
      return { eligible: false, reason: 'High refund rate' };
    }
    
    const maxAmount = Math.floor(metrics.monthlyRevenue * this.ADVANCE_PERCENTAGE);
    const dailyRepayment = Math.floor(metrics.monthlyRevenue * this.REPAYMENT_PERCENTAGE / 30);
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
          processing: Math.ceil(maxAmount * 0.02),
          lateFee: 5000 // TSh 5,000 per day
        }
      }
    };
  }

  async requestAdvance(merchantId: string, amount: number): Promise<AdvanceResult> {
    const eligibility = await this.checkEligibility(merchantId);
    
    if (!eligibility.eligible) {
      throw new Error(`Not eligible: ${eligibility.reason}`);
    }
    
    if (!eligibility.maxAmount || amount > eligibility.maxAmount) {
      throw new Error(`Amount exceeds maximum of TSh ${eligibility.maxAmount}`);
    }
    
    return await prisma.$transaction(async (tx) => {
      // Find merchant's wallet
      const wallet = await tx.merchantWallet.findUnique({
        where: { merchantId: merchantId }
      });
      
      if (!wallet) {
        throw new Error('Wallet not found for merchant');
      }
      
      // Create advance record
      const advance = await tx.merchantAdvance.create({
        data: {
          merchantId,
          amount,
          remainingBalance: amount,
          interestRate: this.INTEREST_RATE,
          repaymentPercentage: this.REPAYMENT_PERCENTAGE,
          status: 'active',
          dailyRepayment: Math.floor(amount * this.REPAYMENT_PERCENTAGE / 30),
          startDate: new Date(),
          expectedEndDate: new Date(Date.now() + 90 * 86400000),
          createdAt: new Date()
        }
      });
      
      // Add funds to merchant wallet
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
      
     return {
  ...advance,
  amount: toNumber(advance.amount),
  remainingBalance: toNumber(advance.remainingBalance),
  dailyRepayment: toNumber(advance.dailyRepayment),
} as AdvanceResult;
    });
  }

  async processDailyRepayment(merchantId: string): Promise<void> {
    const activeAdvance = await prisma.merchantAdvance.findFirst({
      where: { merchantId, status: 'active' }
    });
    
    if (!activeAdvance) return;
    
    const todaySales = await this.getTodaySales(merchantId);
    const repaymentAmount = Math.min(
      Math.floor(todaySales * activeAdvance.repaymentPercentage),
      toNumber(activeAdvance.remainingBalance)
    );
    
    if (repaymentAmount <= 0) return;
    
    await prisma.$transaction(async (tx) => {
      // Find merchant's wallet
      const wallet = await tx.merchantWallet.findUnique({
        where: { merchantId: merchantId }
      });
      
      if (!wallet) return;
      
      // Deduct from merchant wallet
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: repaymentAmount } }
      });
      
      // Update advance record
      const newBalance = toNumber(activeAdvance.remainingBalance) - repaymentAmount;
      await tx.merchantAdvance.update({
        where: { id: activeAdvance.id },
        data: {
          remainingBalance: newBalance,
          status: newBalance <= 0 ? 'completed' : 'active',
          completedAt: newBalance <= 0 ? new Date() : null
        }
      });
      
      // Record repayment (create Repayment model if exists)
      if (tx.repayment) {
        await tx.repayment.create({
          data: {
            advanceId: activeAdvance.id,
            amount: repaymentAmount,
            date: new Date(),
            salesAmount: todaySales
          }
        });
      }
    });
  }

  private async getMerchantMetrics(merchantId: string): Promise<MerchantMetrics> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
    
    const orders = await prisma.order.findMany({
      where: {
        merchantId,
        status: 'completed',
        createdAt: { gte: thirtyDaysAgo }
      }
    });
    
    const totalRevenue = orders.reduce((sum, o) => sum + toNumber(o.amount), 0);
    const orderCount = orders.length;
    
    // Get merchant creation date
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { user: true }
    });
    
    if (!merchant) {
      throw new Error('Merchant not found');
    }
    
    const monthsActive = Math.floor((Date.now() - merchant.user.createdAt.getTime()) / (30 * 86400000));
    
    return {
      monthlyRevenue: totalRevenue,
      avgOrderValue: orderCount > 0 ? totalRevenue / orderCount : 0,
      orderCount,
      monthsActive,
      rating: merchant.rating || 0,
      refundRate: 0.02 // Placeholder - calculate from actual data
    };
  }

  private async getTodaySales(merchantId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const orders = await prisma.order.findMany({
      where: {
        merchantId,
        status: 'completed',
        createdAt: { gte: today }
      }
    });
    
    return orders.reduce((sum, o) => sum + toNumber(o.amount), 0);
  }
}

export default new MerchantLendingService();