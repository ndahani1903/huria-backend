// src/modules/merchants/merchantWithdrawal.service.ts

import { prisma } from '../../config/db';
import { SMSService } from '../../services/sms.service';
import { Decimal } from "@prisma/client/runtime/library";

export const toNumber = (val: any): number => {
  if (!val) return 0;
  if (val instanceof Decimal) return val.toNumber();
  return Number(val);
};

export class MerchantWithdrawalService {
  
  private static readonly MIN_WITHDRAWAL = 10000; // Minimum 10,000 TZS
  private static readonly MAX_WITHDRAWAL = 5000000; // Maximum 5,000,000 TZS
  private static readonly DAILY_LIMIT = 5000000; // 5,000,000 TZS per day
  private static readonly WEEKLY_LIMIT = 45000000; // 45,000,000 TZS per week

  /**
   * Request withdrawal for merchant
   */
  static async requestWithdrawal(
    merchantId: string,
    amount: number,
    phoneNumber: string,
    paymentMethod: 'mobile_money' | 'bank_transfer' = 'mobile_money',
    bankDetails?: { accountName: string; accountNumber: string; bankName: string }
  ) {
   console.log(`🔍 RequestWithdrawal called with merchantId: ${merchantId}`);


    // 1. Validate merchant exists
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { wallet: true, user: true }
    });

    if (!merchant) throw new Error('Merchant not found');
    if (!merchant.wallet) throw new Error('Wallet not found');

  console.log(`✅ Merchant found: ${merchant.id}, Wallet balance: ${merchant.wallet?.balance}`);

  // 2. current balance
   const currentBalance = toNumber(merchant.wallet.balance);
    if (currentBalance < amount) {
      throw new Error(`Insufficient balance. Available: TSh ${currentBalance.toLocaleString()}`);
    }

    // 3. Validate amount
    if (amount < this.MIN_WITHDRAWAL) {
      throw new Error(`Minimum withdrawal amount is TSh ${this.MIN_WITHDRAWAL.toLocaleString()}`);
    }
    if (amount > this.MAX_WITHDRAWAL) {
      throw new Error(`Maximum withdrawal amount is TSh ${this.MAX_WITHDRAWAL.toLocaleString()}`);
    }

    
    // 4. Check for pending withdrawal
    const existingPending = await prisma.merchantWithdrawal.findFirst({
      where: {
        merchantId,
        status: 'pending'
      }
    });

    if (existingPending) {
      throw new Error('You already have a pending withdrawal request. Please wait for it to be processed.');
    }

    // 5. Check daily limit
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayWithdrawn = await prisma.merchantWithdrawal.aggregate({
      where: {
        merchantId,
        status: 'approved',
        approvedAt: { gte: todayStart }
      },
      _sum: { amount: true }
    });
    
    const dailyTotal = toNumber(todayWithdrawn._sum.amount || 0);
    if (dailyTotal + amount > this.DAILY_LIMIT) {
      throw new Error(`Daily withdrawal limit exceeded. Remaining today: TSh ${(this.DAILY_LIMIT - dailyTotal).toLocaleString()}`);
    }

    // 6. Check weekly limit
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);
    
    const weeklyWithdrawn = await prisma.merchantWithdrawal.aggregate({
      where: {
        merchantId,
        status: 'approved',
        approvedAt: { gte: weekStart }
      },
      _sum: { amount: true }
    });
    
    const weeklyTotal = toNumber(weeklyWithdrawn._sum.amount || 0);
    if (weeklyTotal + amount > this.WEEKLY_LIMIT) {
      throw new Error(`Weekly withdrawal limit exceeded. Remaining this week: TSh ${(this.WEEKLY_LIMIT - weeklyTotal).toLocaleString()}`);
    }

    // 7. Validate phone number format (Tanzania)
    const cleanPhone = this.formatPhoneNumber(phoneNumber);
    if (!cleanPhone) {
      throw new Error('Invalid phone number format. Use 07XXXXXXXX or 255XXXXXXXXX');
    }

    // 8. Create withdrawal request (DO NOT deduct balance yet - only when approved)
    const withdrawal = await prisma.merchantWithdrawal.create({
      data: {
        merchant: {
      connect: {
        id: merchant.id  // ← Connect merchant relation
      }
    },
        amount,
        phoneNumber: cleanPhone,
        paymentMethod,
        accountName: bankDetails?.accountName,
        accountNumber: bankDetails?.accountNumber,
        bankName: bankDetails?.bankName,
        status: 'pending',
        createdAt: new Date(),
        wallet: {
      connect: {
        id: merchant.wallet.id  // ← Connect to existing wallet
      }
    }
  }
});


    // Create transaction record
    await prisma.merchantTransaction.create({
      data: {
        walletId: merchant.wallet.id,
        withdrawalId: withdrawal.id,
        orderId: `WITHDRAWAL_${withdrawal.id}`,
        amount,
        type: 'withdrawal',
        status: 'pending',
        description: `Withdrawal request #${withdrawal.id.slice(-8)}`,
        reference: `WDR-${Date.now()}-${withdrawal.id.slice(-8)}`,
        createdAt: new Date()
      }
    });

    // 9. Send SMS notification to merchant
    if (merchant.user?.phone) {
      await SMSService.sendRealSMS(
        merchant.user.phone,
        `💰 Withdrawal request of TSh ${amount.toLocaleString()} has been submitted. Our team will review and process within 24-48 hours. Reference: ${withdrawal.id.slice(-8)}`
      );
    }

    // 10. Notify admin via socket
    const { io } = await import('../../server');
    io.emit('admin:new-withdrawal-request', {
      withdrawalId: withdrawal.id,
      merchantName: merchant.businessName || merchant.name,
      amount: amount,
      merchantPhone: merchant.user?.phone,
      createdAt: new Date()
    });

    return withdrawal;
  }

  /**
   * Get merchant's withdrawal history
   */
  static async getWithdrawalHistory(merchantId: string) {
    const withdrawals = await prisma.merchantWithdrawal.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' }
    });
    
    const wallet = await prisma.merchantWallet.findUnique({
      where: { merchantId }
    });
    
    return {
      withdrawals,
      availableBalance: toNumber(wallet?.balance || 0),
      pendingBalance: toNumber(wallet?.pendingBalance || 0),
      totalWithdrawn: withdrawals
        .filter(w => w.status === 'approved' || w.status === 'completed')
        .reduce((sum, w) => sum + toNumber(w.amount), 0)
    };
  }

  /**
   * Get merchant's withdrawal limits
   */
  static async getWithdrawalLimits(merchantId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    weekStart.setHours(0, 0, 0, 0);
    
    const [todayWithdrawn, weeklyWithdrawn, pendingWithdrawal] = await Promise.all([
      prisma.merchantWithdrawal.aggregate({
        where: { merchantId, status: 'approved', approvedAt: { gte: todayStart } },
        _sum: { amount: true }
      }),
      prisma.merchantWithdrawal.aggregate({
        where: { merchantId, status: 'approved', approvedAt: { gte: weekStart } },
        _sum: { amount: true }
      }),
      prisma.merchantWithdrawal.findFirst({
        where: { merchantId, status: 'pending' }
      })
    ]);
    
    return {
      minWithdrawal: this.MIN_WITHDRAWAL,
      maxWithdrawal: this.MAX_WITHDRAWAL,
      dailyLimit: this.DAILY_LIMIT,
      dailyUsed: toNumber(todayWithdrawn._sum.amount || 0),
      dailyRemaining: this.DAILY_LIMIT - toNumber(todayWithdrawn._sum.amount || 0),
      weeklyLimit: this.WEEKLY_LIMIT,
      weeklyUsed: toNumber(weeklyWithdrawn._sum.amount || 0),
      weeklyRemaining: this.WEEKLY_LIMIT - toNumber(weeklyWithdrawn._sum.amount || 0),
      hasPendingWithdrawal: !!pendingWithdrawal
    };
  }

  /**
   * Format phone number for Tanzania
   */
  private static formatPhoneNumber(phone: string): string {
    let clean = phone.replace(/\s/g, '').replace(/^\+/, '');
    
    // Remove leading zero
    if (clean.startsWith('0')) {
      clean = clean.substring(1);
    }
    
    // Add 255 prefix if not present
    if (!clean.startsWith('255')) {
      clean = '255' + clean;
    }
    
    // Validate length (should be 12 digits for Tanzania)
    if (clean.length !== 12) {
      return null;
    }
    
    return clean;
  }

  /**
   * ADMIN: Get all pending withdrawal requests
   */
  static async getPendingWithdrawals() {
    return prisma.merchantWithdrawal.findMany({
      where: { 
      status: { 
        in: ['pending', 'processing']  // Add more statuses as needed
      } 
    },
      include: {
        merchant: {
          include: { user: { select: { name: true, email: true, phone: true } } }
        },
        wallet: true
      },
      orderBy: { createdAt: 'asc' }
    });
  }

   static async getAllWithdrawals() {
    return prisma.merchantWithdrawal.findMany({
      where: { status: { not: 'pending' } },
      include: {
        merchant: {
          include: { user: { select: { name: true, email: true, phone: true } } }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
  }


  /**
   * ADMIN: Approve withdrawal (deducts balance)
   */
  static async approveWithdrawal(
    withdrawalId: string,
    adminId: string,
    notes?: string
  ) {
    return await prisma.$transaction(async (tx) => {
      // Get withdrawal with merchant wallet
      const withdrawal = await tx.merchantWithdrawal.findUnique({
        where: { id: withdrawalId },
        include: {
          merchant: {
            include: { wallet: true, user: true }
          }
        }
      });

      if (!withdrawal) throw new Error('Withdrawal not found');
      if (withdrawal.status !== 'pending') {
        throw new Error(`Cannot approve withdrawal with status: ${withdrawal.status}`);
      }

      const amount = toNumber(withdrawal.amount);
      const currentBalance = toNumber(withdrawal.merchant.wallet.balance);

      // Check sufficient balance (double-check)
      if (currentBalance < amount) {
        throw new Error(`Insufficient balance. Available: TSh ${currentBalance.toLocaleString()}`);
      }

      // Deduct from wallet
      await tx.merchantWallet.update({
        where: { merchantId: withdrawal.merchantId },
        data: {
          balance: { decrement: amount },
          totalWithdrawn: { increment: amount },
          lastWithdrawalAt: new Date()
        }
      });

      // Update withdrawal status
      const updated = await tx.merchantWithdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: 'approved',
          approvedBy: adminId,
          approvedAt: new Date(),
          processedAt: new Date(),
          notes: notes,
          reference: `WDL-${Date.now()}-${withdrawalId.slice(-8)}`
        }
      });

      // Update transaction
      await tx.merchantTransaction.updateMany({
        where: { withdrawalId },
        data: { status: 'completed' }
      });

      // Log audit
      await tx.auditLog.create({
        data: {
          adminId,
          action: 'APPROVE_MERCHANT_WITHDRAWAL',
          targetType: 'merchant_withdrawal',
          targetId: withdrawalId,
          meta: { amount, merchantId: withdrawal.merchantId }
        }
      });

      // Send SMS notification to merchant
      if (withdrawal.merchant.user?.phone) {
        await SMSService.sendRealSMS(
          withdrawal.merchant.user.phone,
          `✅ Your withdrawal request of TSh ${amount.toLocaleString()} has been APPROVED and will be sent to ${withdrawal.phoneNumber} within 24 hours.`
        );
      }

     const { io } = await import('../../server');
      io.emit('admin:withdrawal-approved', { withdrawalId, merchantName: withdrawal.merchant.businessName, amount });

      return updated;
    });
  }

  /**
   * ADMIN: Reject withdrawal (no deduction, just reject)
   */
  static async rejectWithdrawal(
    withdrawalId: string,
    adminId: string,
    reason: string
  ) {
    if (!reason) throw new Error('Rejection reason is required');

    return await prisma.$transaction(async (tx) => {
      const withdrawal = await tx.merchantWithdrawal.findUnique({
        where: { id: withdrawalId },
        include: {
          merchant: { include: { user: true } }
        }
      });

      if (!withdrawal) throw new Error('Withdrawal not found');
      if (withdrawal.status !== 'pending') {
        throw new Error(`Cannot reject withdrawal with status: ${withdrawal.status}`);
      }

      const updated = await tx.merchantWithdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: 'rejected',
          rejectionReason: reason,
          processedAt: new Date()
        }
      });

     // Update transaction to failed
      await tx.merchantTransaction.updateMany({
        where: { withdrawalId },
        data: { status: 'failed' }
      });

      // Log audit
      await tx.auditLog.create({
        data: {
          adminId,
          action: 'REJECT_MERCHANT_WITHDRAWAL',
          targetType: 'merchant_withdrawal',
          targetId: withdrawalId,
          meta: { reason, amount: withdrawal.amount }
        }
      });

      // Send SMS notification to merchant
      if (withdrawal.merchant.user?.phone) {
        await SMSService.sendRealSMS(
          withdrawal.merchant.user.phone,
          `❌ Your withdrawal request of TSh ${toNumber(withdrawal.amount).toLocaleString()} has been REJECTED. Reason: ${reason}. Please contact support.`
        );
      }

      const { io } = await import('../../server');
      io.emit('admin:withdrawal-rejected', { withdrawalId, reason });

      return updated;
    });
  }

  /**
   * Mark withdrawal as completed (payment sent)
   */
  static async markAsCompleted(
    withdrawalId: string,
    adminId: string,
    transactionReference: string
  ) {
    const withdrawal = await prisma.merchantWithdrawal.update({
      where: { id: withdrawalId },
      data: {
        status: 'completed',
        reference: transactionReference,
        processedAt: new Date()
      },
      include: {
        merchant: { include: { user: true } }
      }
    });

    await prisma.merchantTransaction.updateMany({
      where: { withdrawalId },
      data: { 
        status: 'completed',
        reference: transactionReference,
        createdAt: new Date()
      }
    });

    // Send SMS confirmation
    if (withdrawal.merchant.user?.phone) {
      await SMSService.sendRealSMS(
        withdrawal.merchant.user.phone,
        `💰 TSh ${toNumber(withdrawal.amount).toLocaleString()} has been sent to ${withdrawal.phoneNumber}. Reference: ${transactionReference}`
      );
    }

    return withdrawal;
  }

  /**
   * Get withdrawal statistics for admin dashboard
   */
  static async getWithdrawalStats() {
    const [pending, approved, rejected, completed, totalAmount] = await Promise.all([
      prisma.merchantWithdrawal.count({ where: { status: 'pending' } }),
      prisma.merchantWithdrawal.count({ where: { status: 'approved' } }),
      prisma.merchantWithdrawal.count({ where: { status: 'rejected' } }),
      prisma.merchantWithdrawal.count({ where: { status: 'completed' } }),
      prisma.merchantWithdrawal.aggregate({
        where: { status: { in: ['approved', 'completed'] } },
        _sum: { amount: true }
      })
    ]);

    return {
      pending,
      approved,
      rejected,
      completed,
      totalAmount: toNumber(totalAmount._sum.amount || 0)
    };
  }
}