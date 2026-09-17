// src/modules/merchants/merchantWallet.service.ts

import { prisma } from '../../config/db';
import { NotificationService } from '../notifications/notification.service';
import { SMSService } from '../../services/sms.service';
import { Decimal } from '@prisma/client/runtime/library';

export class MerchantWalletService {

  // ============================================================
  // GET OR CREATE MERCHANT WALLET
  // ============================================================

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

  // ============================================================
  // GET WALLET
  // ============================================================

  static async getWallet(merchantId: string) {
    console.log(`🔍 Getting wallet for merchant: ${merchantId}`);

    const wallet = await this.getOrCreateWallet(merchantId);

    console.log(`📊 Wallet found:`, {
      id: wallet.id,
      balance: Number(wallet.balance),
      pendingBalance: Number(wallet.pendingBalance),
      totalEarned: Number(wallet.totalEarned),
      transactionCount: wallet.transactions?.length || 0
    });

    return {
      id: wallet.id,
      balance: Number(wallet.balance),
      pendingBalance: Number(wallet.pendingBalance),
      totalEarned: Number(wallet.totalEarned),

      transactions:
        wallet.transactions?.map(t => ({
          id: t.id,
          amount: Number(t.amount),
          type: t.type,
          status: t.status,
          description: t.description,
          createdAt: t.createdAt
        })) || []
    };
  }

  // ============================================================
  // GET BALANCE
  // ============================================================

  static async getBalance(merchantId: string) {
    const wallet = await this.getOrCreateWallet(merchantId);

    return {
      balance: Number(wallet.balance),
      pendingBalance: Number(wallet.pendingBalance),
      totalEarned: Number(wallet.totalEarned)
    };
  }

  // ============================================================
  // CREDIT MERCHANT WALLET
  // ============================================================

  static async credit(
    merchantId: string,
    amount: number
  ) {
    try {
      const wallet = await prisma.merchantWallet.update({
        where: { merchantId },
        data: {
          balance: {
            increment: amount
          }
        }
      });

      console.log(
        `💰 Merchant ${merchantId} credited with ${amount} TZS. New balance: ${wallet.balance}`
      );

      // Notify merchant by SMS
      const merchant = await prisma.merchant.findUnique({
        where: { id: merchantId },
        include: {
          user: true
        }
      });

      if (merchant?.user?.phone) {
        await SMSService.sendRealSMS(
          merchant.user.phone,
          `💰 ${amount} TZS added to your wallet from order completion. Total balance: ${wallet.balance} TZS`
        );
      }

      return wallet;
    } catch (error) {
      console.error(
        `Failed to credit merchant ${merchantId}:`,
        error
      );

      throw error;
    }
  }

  // ============================================================
  // ADD PENDING CREDIT
  // ============================================================

  static async addPendingCredit(
    merchantId: string,
    orderId: string,
    amount: number
  ) {
    const wallet =
      await this.getOrCreateWallet(merchantId);

    // Update pending balance
    await prisma.merchantWallet.update({
      where: {
        merchantId
      },
      data: {
        pendingBalance: {
          increment: amount
        }
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
        description:
          `Pending payment for order ${orderId}`
      }
    });
  }

  // ============================================================
  // RELEASE CREDIT
  // ============================================================

  static async releaseCredit(
    merchantId: string,
    orderId: string
  ) {
    const wallet =
      await this.getOrCreateWallet(merchantId);

    // Actual internal order ID
    let actualOrderId = orderId;

    // If a business-facing order ID was supplied,
    // resolve it to the internal database ID.
    if (orderId.startsWith('ORD-')) {
      const order =
        await prisma.order.findUnique({
          where: {
            orderId
          },
          select: {
            id: true
          }
        });

      if (order) {
        actualOrderId = order.id;
      }
    }

    // Find pending transaction
    const pendingTransaction =
      await prisma.merchantTransaction.findFirst({
        where: {
          walletId: wallet.id,
          orderId: actualOrderId,
          type: 'pending_credit',
          status: 'pending'
        }
      });

    if (!pendingTransaction) {
      console.log(
        `⚠️ No pending transaction found for merchant ${merchantId}, order ${orderId}`
      );

      return {
        success: false,
        message: 'No pending transaction found'
      };
    }

    // Update wallet balances
    await prisma.merchantWallet.update({
      where: {
        merchantId
      },
      data: {
        balance: {
          increment: pendingTransaction.amount
        },
        pendingBalance: {
          decrement: pendingTransaction.amount
        },
        totalEarned: {
          increment: pendingTransaction.amount
        }
      }
    });

    // Mark transaction as completed
    await prisma.merchantTransaction.update({
      where: {
        id: pendingTransaction.id
      },
      data: {
        status: 'completed',
        type: 'credit'
      }
    });

    // Notify merchant
    const merchant =
      await prisma.merchant.findUnique({
        where: {
          id: merchantId
        },
        include: {
          user: true
        }
      });

    if (merchant?.user?.phone) {
      await SMSService.sendRealSMS(
        merchant.user.phone,
        `💰 ${pendingTransaction.amount} TZS has been added to your wallet from order ${orderId}`
      );
    }

    return {
      success: true,
      amount: pendingTransaction.amount
    };
  }

  // ============================================================
  // REQUEST WITHDRAWAL
  // ============================================================

  static async requestWithdrawal(
    merchantId: string,
    amount: number,
    phone: string
  ) {
    const wallet =
      await this.getOrCreateWallet(merchantId);

    if (
      new Decimal(wallet.balance).lessThan(amount)
    ) {
      throw new Error('Insufficient balance');
    }

    // Deduct amount from merchant balance
    await prisma.merchantWallet.update({
      where: {
        merchantId
      },
      data: {
        balance: {
          decrement: amount
        }
      }
    });

    /*
     * MerchantWithdrawal requires:
     * - wallet
     * - merchant
     * - phoneNumber
     *
     * All three values are available here.
     */
    const withdrawal =
      await prisma.merchantWithdrawal.create({
        data: {
          wallet: {
            connect: {
              id: wallet.id
            }
          },

          merchant: {
            connect: {
              id: merchantId
            }
          },

          phoneNumber: phone,

          amount,

          status: 'pending'
        }
      });

    return withdrawal;
  }

  // ============================================================
  // PROCESS WITHDRAWAL
  // ============================================================

  static async processWithdrawal(
    withdrawalId: string,
    status: 'completed' | 'failed'
  ) {
    const withdrawal =
      await prisma.merchantWithdrawal.findUnique({
        where: {
          id: withdrawalId
        },
        include: {
          wallet: {
            include: {
              merchant: {
                include: {
                  user: true
                }
              }
            }
          }
        }
      });

    if (!withdrawal) {
      throw new Error('Withdrawal not found');
    }

    const updated =
      await prisma.merchantWithdrawal.update({
        where: {
          id: withdrawalId
        },
        data: {
          status,
          processedAt: new Date()
        }
      });

    // Failed withdrawal:
    // refund amount to merchant wallet
    if (status === 'failed') {
      await prisma.merchantWallet.update({
        where: {
          id: withdrawal.walletId
        },
        data: {
          balance: {
            increment: withdrawal.amount
          }
        }
      });
    } else {
      // Successful withdrawal notification
      const merchantPhone =
        withdrawal.wallet.merchant.user.phone;

      if (merchantPhone) {
        await SMSService.sendRealSMS(
          merchantPhone,
          `✅ Withdrawal of ${withdrawal.amount} TZS has been processed successfully!`
        );
      }
    }

    return updated;
  }

  // ============================================================
  // GET TRANSACTION HISTORY
  // ============================================================

  static async getTransactionHistory(
    merchantId: string,
    limit = 20
  ) {
    const wallet =
      await this.getOrCreateWallet(merchantId);

    const transactions =
      await prisma.merchantTransaction.findMany({
        where: {
          walletId: wallet.id
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: limit
      });

    return transactions.map(t => ({
      ...t,
      amount: Number(t.amount)
    }));
  }
}

export default MerchantWalletService;