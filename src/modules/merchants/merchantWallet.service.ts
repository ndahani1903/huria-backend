import { prisma } from '../../config/db';
import { NotificationService } from '../notifications/notification.service';
import { SMSService } from '../../services/sms.service';

export class MerchantWalletService {
  
  // Get or create merchant wallet
  static async getOrCreateWallet(merchantId: string) {
    let wallet = await prisma.merchantWallet.findUnique({
      where: { merchantId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 10
        }
      }
    });
    
    if (!wallet) {
      wallet = await prisma.merchantWallet.create({
        data: {
          merchantId,
          balance: 0,
          pendingBalance: 0,
          totalEarned: 0
        },
        include: {
          transactions: true
        }
      });
    }
    
    return wallet;
  }
  
  static async credit(merchantId: string, amount: number) {
     try {
      const wallet = await prisma.merchantWallet.update({
      where: { merchantId },
      data: {
        balance: { increment: amount },
       },
        //create: {
         // merchantId,
         // balance: amount,
     // },
    });

console.log(`💰 Merchant ${merchantId} credited with ${amount} TZS. New balance: ${wallet.balance}`);

 // ✅ SMS: Notify merchant about credit
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { user: true }
    });
    
    if (merchant?.user?.phone) {
      await NotificationService.sendSMS(
        merchant.user.phone,
      `💰 ${amount} TZS has been added to your wallet`
      );
 await SMSService.send(merchant.user.phone, `💰 ${amount} TZS added to your wallet from order completion. Total balance: ${wallet.balance} TZS`);
    }
     

    return wallet;
} catch (error) {
      console.error(`Failed to credit merchant ${merchantId}:`, error);
      throw error;
    }
  }

  // Add pending credit (when order is paid but not completed)
  static async addPendingCredit(merchantId: string, orderId: string, amount: number) {
    const wallet = await this.getOrCreateWallet(merchantId);
    
    // Update pending balance
    await prisma.merchantWallet.update({
      where: { merchantId },
      data: {
        pendingBalance: { increment: amount }
      }
    });
    
    // Create pending transaction
    return prisma.merchantTransaction.create({
      data: {
        walletId: wallet.id,
        orderId,
        amount,
        type: 'pending_credit',
        status: 'pending',
        description: `Pending payment for order ${orderId}`
      }
    });
  }
  
  // Release credit to merchant (when order is completed)
  static async releaseCredit(merchantId: string, orderId: string) {
    const wallet = await this.getOrCreateWallet(merchantId);
    
    // Find the pending transaction
    const pendingTransaction = await prisma.merchantTransaction.findFirst({
      where: {
        walletId: wallet.id,
        orderId,
        type: 'pending_credit',
        status: 'pending'
      }
    });
    
    if (!pendingTransaction) {
      throw new Error('No pending transaction found for this order');
    }
    
    // Update wallet balances
    await prisma.merchantWallet.update({
      where: { merchantId },
      data: {
        balance: { increment: pendingTransaction.amount },
        pendingBalance: { decrement: pendingTransaction.amount },
        totalEarned: { increment: pendingTransaction.amount }
      }
    });
    
    // Mark transaction as completed
    await prisma.merchantTransaction.update({
      where: { id: pendingTransaction.id },
      data: {
        status: 'completed',
        type: 'credit'
      }
    });
    
    // Send notification to merchant
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      include: { user: true }
    });
    
    if (merchant?.user?.phone) {
      await NotificationService.sendSMS(
        merchant.user.phone,
        `💰 ${pendingTransaction.amount} TZS has been added to your wallet from order ${orderId}`
      );
    }
    
    return { success: true, amount: pendingTransaction.amount };
  }
  
  // Get wallet balance
  static async getBalance(merchantId: string) {
    const wallet = await this.getOrCreateWallet(merchantId);
    return {
      balance: wallet.balance,
      pendingBalance: wallet.pendingBalance,
      totalEarned: wallet.totalEarned
    };
  }
  
  // Request withdrawal
  static async requestWithdrawal(merchantId: string, amount: number, phone: string) {
    const wallet = await this.getOrCreateWallet(merchantId);
    
    if (wallet.balance < amount) {
      throw new Error('Insufficient balance');
    }
    
    // Deduct from balance
    await prisma.merchantWallet.update({
      where: { merchantId },
      data: {
        balance: { decrement: amount }
      }
    });
    
    // Create withdrawal request
    const withdrawal = await prisma.merchantWithdrawal.create({
      data: {
        walletId: wallet.id,
        amount,
        phone,
        status: 'pending'
      }
    });
    
    return withdrawal;
  }
  
  // Process withdrawal (admin function)
  static async processWithdrawal(withdrawalId: string, status: 'completed' | 'failed') {
    const withdrawal = await prisma.merchantWithdrawal.findUnique({
      where: { id: withdrawalId },
      include: { wallet: { include: { merchant: { include: { user: true } } } } }
    });
    
    if (!withdrawal) throw new Error('Withdrawal not found');
    
    const updated = await prisma.merchantWithdrawal.update({
      where: { id: withdrawalId },
      data: {
        status,
        processedAt: new Date()
      }
    });
    
    if (status === 'failed') {
      // Refund the amount back to wallet
      await prisma.merchantWallet.update({
        where: { id: withdrawal.walletId },
        data: {
          balance: { increment: withdrawal.amount }
        }
      });
    } else {
      // Send success notification
      await NotificationService.sendSMS(
        withdrawal.wallet.merchant.user.phone,
        `✅ Withdrawal of ${withdrawal.amount} TZS has been processed successfully!`
      );
    }
    
    return updated;
  }
  
  // Get transaction history
  static async getTransactionHistory(merchantId: string, limit = 20) {
    const wallet = await this.getOrCreateWallet(merchantId);
    
    return prisma.merchantTransaction.findMany({
      where: { walletId: wallet.id },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }
}