// src/modules/drivers/driverWithdrawal.service.ts

import { prisma } from '../../config/db';
import { SMSService } from '../../services/sms.service';
import { Decimal } from "@prisma/client/runtime/library";

export const toNumber = (val: any): number => {
  if (!val) return 0;
  if (val instanceof Decimal) return val.toNumber();
  return Number(val);
};

export class DriverWithdrawalService {
  private static readonly MIN_WITHDRAWAL = 5000;
  private static readonly MAX_WITHDRAWAL = 1000000;
  private static readonly DAILY_LIMIT = 500000;

  // Driver requests withdrawal
  static async requestWithdrawal(driverId: string, amount: number, phoneNumber: string, requestId?: string) {
    // 1. Prevent duplicate request (VERY IMPORTANT)
  if (requestId) {
    const existing = await prisma.withdrawal.findUnique({
      where: { requestId }
    });

    if (existing) return existing;
  }

  // 2. Load driver + wallet
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { wallet: true, user: true }
    });

    if (!driver) throw new Error('Driver not found');
    if (!driver.wallet) throw new Error('Wallet not found');

    const wallet = driver.wallet;

    const balance = toNumber(wallet.balance);

    // 3. VALIDATION RULES
  if (amount > balance) {
    throw new Error(`Insufficient balance. Available: TSh ${balance.toLocaleString()}`);
  }

    if (amount < this.MIN_WITHDRAWAL) {
      throw new Error(`Minimum withdrawal is TSh ${this.MIN_WITHDRAWAL.toLocaleString()}`);
    }
    if (amount > this.MAX_WITHDRAWAL) {
      throw new Error(`Maximum withdrawal is TSh ${this.MAX_WITHDRAWAL.toLocaleString()}`);
    }


   // 4. DAILY LIMIT CHECK
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayWithdrawn = await prisma.withdrawal.aggregate({
    where: {
      driverId,
      status: 'approved',
      createdAt: { gte: todayStart }
    },
    _sum: { amount: true }
  });

  const dailyTotal = toNumber(todayWithdrawn._sum.amount || 0);

  if (dailyTotal + amount > this.DAILY_LIMIT) {
    throw new Error(`Daily limit exceeded`);
  }

  // 5. ONE PENDING ONLY
  const existingPending = await prisma.withdrawal.findFirst({
    where: { driverId, status: 'pending' }
  });

    if (existingPending) {
      throw new Error('You already have a pending withdrawal request');
    }

    const cleanPhone = this.formatPhoneNumber(phoneNumber);
    if (!cleanPhone) throw new Error('Invalid phone number format');


    return await prisma.$transaction(async (tx) => {

    // 🔥 RESERVE MONEY (KEY CHANGE)
    await tx.wallet.update({
      where: { driverId },
      data: {
        balance: { decrement: amount },
        pendingBalance: { increment: amount }
      }
    });

    const withdrawal = await prisma.withdrawal.create({
      data: {
        driverId,
        amount,
        phone: cleanPhone,
        status: 'pending',
        requestId: `HRQ-${Date.now()}}`,
        createdAt: new Date()
      }
    });

    if (driver.user?.phone) {
      await SMSService.sendRealSMS(
        driver.user.phone,
        `💰 Withdrawal request of TSh ${amount.toLocaleString()} submitted. We'll process within 24 hours.`
      );
    }

    const { io } = await import('../../server');
    io.emit('admin:new-driver-withdrawal', {
      withdrawalId: withdrawal.id,
      driverName: driver.user?.name,
      amount,
      createdAt: new Date()
    });

    return withdrawal;
   });
  }

  static async getWithdrawalHistory(driverId: string) {
    const withdrawals = await prisma.withdrawal.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' }
    });
    
    const wallet = await prisma.wallet.findUnique({
      where: { driverId }
    });
    
    return {
      withdrawals,
      availableBalance: toNumber(wallet?.balance || 0),
      totalWithdrawn: withdrawals
        .filter(w => w.status === 'approved' || w.status === 'completed')
        .reduce((sum, w) => sum + toNumber(w.amount), 0)
    };
  }

  static async getWithdrawalLimits(driverId: string) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    
    const todayWithdrawn = await prisma.withdrawal.aggregate({
      where: { driverId, status: 'approved', createdAt: { gte: todayStart } },
      _sum: { amount: true }
    });
    
    const pendingWithdrawal = await prisma.withdrawal.findFirst({
      where: { driverId, status: 'pending' }
    });
    
    return {
      minWithdrawal: this.MIN_WITHDRAWAL,
      maxWithdrawal: this.MAX_WITHDRAWAL,
      dailyLimit: this.DAILY_LIMIT,
      dailyUsed: toNumber(todayWithdrawn._sum.amount || 0),
      dailyRemaining: this.DAILY_LIMIT - toNumber(todayWithdrawn._sum.amount || 0),
      hasPendingWithdrawal: !!pendingWithdrawal
    };
  }

  // Admin approves withdrawal
  static async approveWithdrawal(withdrawalId: string, adminId: string) {
    return await prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.findUnique({
        where: { id: withdrawalId },
        include: { driver: { include: { wallet: true, user: true } } }
      });

      if (!withdrawal) throw new Error('Withdrawal not found');
      if (withdrawal.status !== 'pending') {
        throw new Error(`Cannot approve withdrawal with status: ${withdrawal.status}`);
      }

      const amount = toNumber(withdrawal.amount);

      // 🔥 ONLY CLEAR PENDING BALANCE (NO DOUBLE DEDUCTION)
    await tx.wallet.update({
      where: { driverId: withdrawal.driverId },
      data: {
        pendingBalance: { decrement: amount }
      }
    });

      const updated = await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: 'approved',
          processedAt: new Date(),
          reference: `DRV-APV-${Date.now()}-${withdrawalId.slice(-8)}`
        }
      });

      await tx.auditLog.create({
        data: {
          adminId,
          action: 'APPROVE_DRIVER_WITHDRAWAL',
          targetType: 'withdrawal',
          targetId: withdrawalId,
          meta: { amount, driverId: withdrawal.driverId }
        }
      });

      if (withdrawal.driver.user?.phone) {
        await SMSService.sendRealSMS(
          withdrawal.driver.user.phone,
          `✅ Withdrawal of TSh ${amount.toLocaleString()} has been APPROVED. Funds will be sent to ${withdrawal.phone} within 24 hours.`
        );
      }

      const { io } = await import('../../server');
      io.emit('admin:driver-withdrawal-approved', { withdrawalId, amount });

      return updated;
    });
  }

  // Admin rejects withdrawal
  static async rejectWithdrawal(withdrawalId: string, adminId: string, reason: string) {
    if (!reason) throw new Error('Rejection reason is required');

    return await prisma.$transaction(async (tx) => {
      const withdrawal = await tx.withdrawal.findUnique({
        where: { id: withdrawalId },
        include: { driver: { include: { user: true } } }
      });

      if (!withdrawal) throw new Error('Withdrawal not found');
      if (withdrawal.status !== 'pending') {
        throw new Error(`Cannot reject withdrawal with status: ${withdrawal.status}`);
      }

      const updated = await tx.withdrawal.update({
        where: { id: withdrawalId },
        data: {
          status: 'rejected',
          rejectionReason: reason,
          processedAt: new Date()
        }
      });

      await tx.auditLog.create({
        data: {
          adminId,
          action: 'REJECT_DRIVER_WITHDRAWAL',
          targetType: 'withdrawal',
          targetId: withdrawalId,
          meta: { reason, amount: withdrawal.amount }
        }
      });

      if (withdrawal.driver.user?.phone) {
        await SMSService.sendRealSMS(
          withdrawal.driver.user.phone,
          `❌ Withdrawal of TSh ${toNumber(withdrawal.amount).toLocaleString()} has been REJECTED. Reason: ${reason}. Contact support.`
        );
      }

      return updated;
    });
  }

  private static formatPhoneNumber(phone: string): string {
    let clean = phone.replace(/\s/g, '').replace(/^\+/, '');
    if (clean.startsWith('0')) clean = clean.substring(1);
    if (!clean.startsWith('255')) clean = '255' + clean;
    return clean.length === 12 ? clean : null;
  }
}