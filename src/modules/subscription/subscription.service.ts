// src/modules/subscription/subscription.service.ts

import { prisma } from "../../config/db";
import { AzamPayService } from "../../services/azampay.service";
import { v4 as uuidv4 } from "uuid";
import { randomUUID } from "crypto";
import { CardTransactionType } from "@prisma/client";

export const SUBSCRIPTION_TIERS = {
  plus: {
    name: "HURIA Plus",
    price: 9500,
    benefits: {
      freeDelivery: true,
      freeDeliveryMaxDistance: 45,
      discountPercentage: 5,
      prioritySupport: false,
      monthlyCredits: 0,
    },
  },
  premium: {
    name: "HURIA Premium",
    price: 33500,
    benefits: {
      freeDelivery: true,
      freeDeliveryMaxDistance: 200,
      discountPercentage: 10,
      prioritySupport: true,
      monthlyCredits: 5000,
    },
  },
  tanzanite: {
    name: "HURIA Tanzanite",
    price: 85000,
    benefits: {
      freeDelivery: true,
      freeDeliveryMaxDistance: Infinity,
      discountPercentage: 15,
      prioritySupport: true,
      monthlyCredits: 25000,
      multipleUsers: true,
      apiAccess: true,
    },
  },
};

export interface OrderBenefits {
  discountPercentage: number;
  discountAmount: number;
  finalAmount: number;
  freeDelivery: boolean;
  deliveryFee: number;
  welcomePromoApplied: boolean;
  promoApplied: boolean;
  promoId?: string;
  subscriptionTier?: string;
}

export class SubscriptionService {
  // ============================================================
  // SUBSCRIPTION / HURIA CARD METHODS
  // ============================================================

  async getOrCreateHuriaCard(userId: string): Promise<any> {
    let card = await prisma.huriaCard.findUnique({
      where: { userId },
    });

    if (!card) {
      const timestamp = Date.now().toString(36).toUpperCase();
      const random = Math.random().toString(36).substring(2, 8).toUpperCase();
      const cardNumber = `HURIA-${timestamp.slice(-4)}-${random}`;

      card = await prisma.huriaCard.create({
        data: {
          userId,
          cardNumber,
          cardName: `${cardNumber}`,
          balance: 0,
          hcoins: 0,
        },
      });

      console.log(
        `💳 Created HURIA Card for user ${userId}: ${cardNumber}`
      );
    }

    return card;
  }

  async getCardDetails(userId: string): Promise<any> {
    const card = await this.getOrCreateHuriaCard(userId);

    const today = new Date();
    const lastReset = new Date(card.lastResetDate);

    if (
      lastReset.getDate() !== today.getDate() ||
      lastReset.getMonth() !== today.getMonth() ||
      lastReset.getFullYear() !== today.getFullYear()
    ) {
      await prisma.huriaCard.update({
        where: { id: card.id },
        data: {
          dailySpent: 0,
          lastResetDate: today,
        },
      });

      card.dailySpent = 0;
    }

    if (
      lastReset.getMonth() !== today.getMonth() ||
      lastReset.getFullYear() !== today.getFullYear()
    ) {
      await prisma.huriaCard.update({
        where: { id: card.id },
        data: {
          monthlySpent: 0,
        },
      });

      card.monthlySpent = 0;
    }

    return {
      cardNumber: card.cardNumber,
      cardName: card.cardName,
      balance: card.balance,
      hcoins: card.hcoins,
      dailyLimit: card.dailyLimit,
      dailySpent: card.dailySpent,
      monthlyLimit: card.monthlyLimit,
      monthlySpent: card.monthlySpent,
      remainingDaily:
        Number(card.dailyLimit) - Number(card.dailySpent),
      remainingMonthly:
        Number(card.monthlyLimit) - Number(card.monthlySpent),
      cashbackRate: card.cashbackRate,
      isActive: card.isActive,
    };
  }

  async topUpCard(
    userId: string,
    amount: number,
    phone: string
  ): Promise<any> {
    const card = await this.getOrCreateHuriaCard(userId);

    if (!card.isActive) {
      throw new Error("Card is deactivated");
    }

    if (amount < 5000) {
      throw new Error("Minimum top up is TSh 5,000");
    }

    let cleanPhone = phone.replace(/\D/g, "");

    if (cleanPhone.startsWith("0")) {
      cleanPhone = "255" + cleanPhone.slice(1);
    }

    if (!/^255\d{9}$/.test(cleanPhone)) {
      throw new Error("Invalid phone number");
    }

    let provider: "Airtel" | "Tigo" | "Halopesa" | "Mpesa" = "Mpesa";

    if (
      cleanPhone.startsWith("25574") ||
      cleanPhone.startsWith("25575") ||
      cleanPhone.startsWith("25576")
    ) {
      provider = "Mpesa";
    } else if (
      cleanPhone.startsWith("25568") ||
      cleanPhone.startsWith("25569") ||
      cleanPhone.startsWith("25578")
    ) {
      provider = "Airtel";
    } else if (
      cleanPhone.startsWith("25565") ||
      cleanPhone.startsWith("25567") ||
      cleanPhone.startsWith("25571")
    ) {
      provider = "Tigo";
    } else if (
      cleanPhone.startsWith("25562") ||
      cleanPhone.startsWith("25561")
    ) {
      provider = "Halopesa";
    }

    const reference = `TOPUP-${randomUUID()}`;
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    const transaction = await prisma.cardTransaction.create({
      data: {
        cardId: card.id,
        amount,
        type: CardTransactionType.TOPUP,
        description: `Top up via ${provider}`,
        reference,
        status: "pending",
        expiresAt,
        metadata: {
          provider,
          phone: cleanPhone,
          initiatedAt: new Date(),
        },
      },
    });

    const isSandbox =
      process.env.AZAMPAY_ENVIRONMENT === "sandbox";

    if (isSandbox) {
      console.log(
        "🔧 Sandbox mode: Auto-completing top up in 3 seconds..."
      );

      setTimeout(async () => {
        try {
          await this.confirmCardTopUp(reference, true);

          console.log(
            `✅ Sandbox top up auto-completed for reference: ${reference}`
          );
        } catch (error) {
          console.error(
            "Failed to auto-complete sandbox top up:",
            error
          );
        }
      }, 3000);

      return {
        success: true,
        requiresPaymentConfirmation: true,
        reference,
        transactionId: `SANDBOX_${Date.now()}`,
        message:
          "Sandbox mode: Top up will be auto-completed in 3 seconds.",
      };
    }

    try {
      const azamPayResult =
        await AzamPayService.initiatePayment(
          amount,
          cleanPhone,
          reference,
          "Top up HURIA Card",
          provider
        );

      return {
        success: true,
        requiresPaymentConfirmation: true,
        reference,
        transactionId: azamPayResult.transactionId,
        message: `STK push sent to ${phone}. Please check your phone and enter PIN.`,
      };
    } catch (error) {
      console.error("❌ Failed to initiate topup:", error);

      await prisma.cardTransaction.update({
        where: { id: transaction.id },
        data: { status: "failed" },
      });

      throw new Error(
        "Unable to initiate payment. Please try again."
      );
    }
  }

  async confirmCardTopUp(
    reference: string,
    success: boolean
  ): Promise<any> {
    return await prisma.$transaction(async (tx) => {
      const transaction =
        await tx.cardTransaction.findFirst({
          where: {
            reference,
            type: CardTransactionType.TOPUP,
          },
        });

      if (!transaction) {
        return {
          success: false,
          message: "Transaction not found",
        };
      }

      if (
        transaction.expiresAt &&
        transaction.expiresAt < new Date()
      ) {
        await tx.cardTransaction.update({
          where: { id: transaction.id },
          data: { status: "failed" },
        });

        return {
          success: false,
          expired: true,
          message: "Top up expired",
        };
      }

      if (transaction.status === "completed") {
        return {
          success: true,
          duplicate: true,
          amount: transaction.amount,
          message: "Top up already processed",
        };
      }

      if (transaction.status === "failed") {
        return {
          success: false,
          message: "Transaction already failed",
        };
      }

      const card = await tx.huriaCard.findUnique({
        where: { id: transaction.cardId },
      });

      if (!card) {
        throw new Error("Card not found");
      }

      if (!success) {
        await tx.cardTransaction.update({
          where: { id: transaction.id },
          data: { status: "failed" },
        });

        return {
          success: false,
          message: "Payment failed",
        };
      }

      const hcoinsEarned = Math.max(
        0,
        Math.floor(Number(transaction.amount) / 100)
      );

      const claimed =
        await tx.cardTransaction.updateMany({
          where: {
            id: transaction.id,
            status: "pending",
          },
          data: {
            status: "processing",
            gatewayVerified: true,
          },
        });

      if (claimed.count === 0) {
        return {
          success: true,
          duplicate: true,
          message: "Already being processed",
        };
      }

      await tx.huriaCard.update({
        where: { id: card.id },
        data: {
          balance: { increment: transaction.amount },
          hcoins: { increment: hcoinsEarned },
          version: { increment: 1 },
          lastTransactionAt: new Date(),
        },
      });

      await tx.cardTransaction.update({
        where: { id: transaction.id },
        data: { status: "completed" },
      });

      await tx.hCoinTransaction.create({
        data: {
          userId: card.userId,
          amount: hcoinsEarned,
          type: "bonus",
          description: "Card top up bonus HCoins",
          reference,
        },
      });

      return {
        success: true,
        amount: transaction.amount,
        hcoinsEarned,
        message: "Card topped up successfully",
      };
    });
  }

  async payWithCard(
    userId: string,
    amount: number,
    orderId?: string
  ): Promise<any> {
    const result = await prisma.$transaction(async (tx) => {
      const card = await tx.huriaCard.findUnique({
        where: { userId },
      });

      if (!card) {
        throw new Error("Card not found");
      }

      if (!card.isActive) {
        throw new Error("Card is deactivated");
      }

      if (card.isLocked) {
        throw new Error("Card is locked");
      }

      if (Number(card.balance) < amount) {
        throw new Error("Insufficient card balance");
      }

      const newDailySpent =
        Number(card.dailySpent) + amount;
      const newMonthlySpent =
        Number(card.monthlySpent) + amount;

      if (
        newDailySpent >
        Number(card.dailyLimit)
      ) {
        throw new Error("Daily limit exceeded");
      }

      if (
        newMonthlySpent >
        Number(card.monthlyLimit)
      ) {
        throw new Error("Monthly limit exceeded");
      }

      const cashbackAmount = Number(
        (
          amount *
          (Number(card.cashbackRate) / 100)
        ).toFixed(2)
      );

      const hcoinsEarned = Math.floor(amount / 100);

      const updatedCard =
        await tx.huriaCard.updateMany({
          where: {
            id: card.id,
            version: card.version,
          },
          data: {
            balance: { decrement: amount },
            dailySpent: { increment: amount },
            monthlySpent: { increment: amount },
            version: { increment: 1 },
            lastTransactionAt: new Date(),
          },
        });

      if (updatedCard.count === 0) {
        throw new Error(
          "Card balance changed. Please retry."
        );
      }

      await tx.cardTransaction.create({
        data: {
          cardId: card.id,
          amount,
          type: CardTransactionType.PURCHASE,
          reference: orderId
            ? `ORDER-${orderId}`
            : `CARD-${uuidv4()}`,
          description: orderId
            ? `Order ${orderId}`
            : "Store purchase",
          orderId,
          hcoinsEarned,
          cashbackAmount,
          status: "completed",
        },
      });

      await tx.hCoinTransaction.create({
        data: {
          userId,
          amount: hcoinsEarned,
          type: "cashback",
          description: `Cashback for purchase ${orderId || ""}`,
          reference: orderId || undefined,
        },
      });

      if (cashbackAmount > 0) {
        await tx.huriaCard.update({
          where: { id: card.id },
          data: {
            balance: { increment: cashbackAmount },
          },
        });
      }

      return {
        cardId: card.id,
        originalBalance: Number(card.balance),
        cashbackAmount,
        hcoinsEarned,
      };
    });

    return {
      success: true,
      newBalance:
        result.originalBalance -
        amount +
        result.cashbackAmount,
      cashbackEarned: result.cashbackAmount,
      hcoinsEarned: result.hcoinsEarned,
      message: `Payment successful! You earned ${result.hcoinsEarned} HCoins and ${result.cashbackAmount} TZS cashback`,
    };
  }

  async payOrderWithCard(
    userId: string,
    orderId: string
  ): Promise<any> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        userId: true,
        amount: true,
        totalAmount: true,
        deliveryFee: true,
        status: true,
      },
    });

    if (!order) {
      throw new Error("Order not found");
    }

    if (order.userId !== userId) {
      throw new Error("Unauthorized");
    }

    if (
      order.status === "paid" ||
      order.status === "completed"
    ) {
      throw new Error("Order already paid");
    }

    const payableAmount = Number(
      order.totalAmount ||
        Number(order.amount) +
          Number(order.deliveryFee || 0)
    );

    const cardResult = await this.payWithCard(
      userId,
      payableAmount,
      order.id
    );

    const { PaymentService } =
      await import("../payments/payment.service");

    await PaymentService.completeOrderPayment(
      order.id,
      userId,
      payableAmount,
      "huria_card",
      `CARD_${Date.now()}`
    );

    return {
      success: true,
      orderId: order.id,
      amount: payableAmount,
      cardBalance: cardResult.newBalance,
      cashbackEarned: cardResult.cashbackEarned,
      hcoinsEarned: cardResult.hcoinsEarned,
      message:
        "Order paid successfully using HURIA Card",
    };
  }

  async refundCardPayment(
    orderId: string,
    reason: string
  ): Promise<any> {
    return prisma.$transaction(async (tx) => {
      const purchaseTx =
        await tx.cardTransaction.findFirst({
          where: {
            orderId,
            type: CardTransactionType.PURCHASE,
            status: "completed",
          },
        });

      if (!purchaseTx) {
        throw new Error("Original purchase not found");
      }

      const existingRefund =
        await tx.cardTransaction.findFirst({
          where: {
            orderId,
            type: CardTransactionType.REFUND,
            status: "completed",
          },
        });

      if (existingRefund) {
        throw new Error("Order already refunded");
      }

      const card = await tx.huriaCard.findUnique({
        where: { id: purchaseTx.cardId },
      });

      if (!card) {
        throw new Error("Card not found");
      }

      const earnedCashback = Number(
        purchaseTx.cashbackAmount || 0
      );

      const earnedHCoins =
        purchaseTx.hcoinsEarned || 0;

      await tx.huriaCard.update({
        where: { id: card.id },
        data: {
          balance: {
            increment:
              Number(purchaseTx.amount) -
              earnedCashback,
          },
          hcoins: {
            decrement: Math.min(
              Number(card.hcoins),
              earnedHCoins
            ),
          },
          version: { increment: 1 },
        },
      });

      await tx.cardTransaction.create({
        data: {
          cardId: card.id,
          amount: purchaseTx.amount,
          type: CardTransactionType.REFUND,
          status: "completed",
          orderId,
          description: reason,
          reference: `REFUND_${Date.now()}`,
        },
      });

      if (earnedHCoins > 0) {
        await tx.hCoinTransaction.create({
          data: {
            userId: card.userId,
            amount: -earnedHCoins,
            type: "refund",
            description: `HCoins reversed for order ${orderId}`,
            reference: orderId,
          },
        });
      }

      await tx.payment.update({
        where: { orderId },
        data: { status: "refunded" },
      });

      return {
        success: true,
        amount: purchaseTx.amount,
      };
    });
  }

  // ============================================================
  // SUBSCRIPTION
  // ============================================================

  async subscribeWithCard(
    userId: string,
    tier: string
  ): Promise<any> {
    const tierInfo = SUBSCRIPTION_TIERS[tier];

    if (!tierInfo) {
      throw new Error("Invalid subscription tier");
    }

    const pendingSub =
      await prisma.subscription.findFirst({
        where: {
          userId,
          status: "pending_payment",
        },
      });

    if (pendingSub) {
      console.log(
        `⚠️ Found existing pending subscription for user ${userId}, cancelling it...`
      );

      await prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: pendingSub.id },
          data: {
            status: "cancelled",
            autoRenew: false,
            updatedAt: new Date(),
          },
        });

        await tx.subscriptionTransaction.updateMany({
          where: {
            subscriptionId: pendingSub.id,
            status: "pending",
          },
          data: { status: "failed" },
        });
      });
    }

    const existingActive =
      await prisma.subscription.findFirst({
        where: {
          userId,
          status: "active",
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
        },
      });

    if (existingActive) {
      throw new Error(
        `You already have an active ${existingActive.tier} subscription. Cancel it first to upgrade.`
      );
    }

    const card = await this.getOrCreateHuriaCard(userId);

    if (!card.isActive) {
      throw new Error("Card is deactivated");
    }

    if (Number(card.balance) < tierInfo.price) {
      throw new Error(
        `Insufficient card balance. Need TSh ${tierInfo.price.toLocaleString()}. Please top up your card.`
      );
    }

    const paymentResult = await this.payWithCard(
      userId,
      tierInfo.price
    );

    await prisma.subscription.updateMany({
      where: {
        userId,
        status: "active",
      },
      data: {
        status: "cancelled",
        autoRenew: false,
      },
    });

    const subscription =
      await prisma.subscription.create({
        data: {
          userId,
          tier,
          price: tierInfo.price,
          status: "active",
          startDate: new Date(),
          endDate: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
          ),
          autoRenew: true,
          paymentMethod: "huria_card",
        },
      });

    await prisma.subscriptionTransaction.create({
      data: {
        subscriptionId: subscription.id,
        userId,
        amount: tierInfo.price,
        status: "completed",
        periodStart: new Date(),
        periodEnd: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ),
        reference: `SUB-${Date.now()}`,
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (user?.phone) {
      const { SMSService } =
        await import("../../services/sms.service");

      await SMSService.sendRealSMS(
        user.phone,
        `🎉 Welcome to ${tierInfo.name}! Your subscription is active until ${subscription.endDate.toLocaleDateString()}. Enjoy ${tierInfo.benefits.discountPercentage}% off and free delivery!`
      );
    }

    await this.applyWelcomeBenefits(userId, tier);

    return {
      success: true,
      subscription,
      cardBalance: paymentResult.newBalance,
      message: paymentResult.message,
    };
  }

  async subscribeWithMobile(
    userId: string,
    tier: string,
    phone: string
  ): Promise<any> {
    const tierInfo = SUBSCRIPTION_TIERS[tier];

    if (!tierInfo) {
      throw new Error("Invalid subscription tier");
    }

    const existingActive =
      await prisma.subscription.findFirst({
        where: {
          userId,
          status: "active",
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
        },
      });

    if (existingActive) {
      throw new Error(
        `You already have an active ${existingActive.tier} subscription. Please cancel it first.`
      );
    }

    const existingPending =
      await prisma.subscription.findFirst({
        where: {
          userId,
          status: "pending_payment",
        },
      });

    if (existingPending) {
      console.log(
        `⚠️ Found existing pending subscription for user ${userId}, cancelling it...`
      );

      await prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: existingPending.id },
          data: {
            status: "cancelled",
            autoRenew: false,
            updatedAt: new Date(),
          },
        });

        await tx.subscriptionTransaction.updateMany({
          where: {
            subscriptionId: existingPending.id,
            status: "pending",
          },
          data: { status: "failed" },
        });
      });

      console.log(
        `✅ Cancelled old pending subscription, proceeding with new one...`
      );
    }

    if (!phone) {
      throw new Error("Phone number required");
    }

    let cleanPhone = phone.replace(/\D/g, "");

    if (cleanPhone.startsWith("0")) {
      cleanPhone = "255" + cleanPhone.slice(1);
    }

    if (!/^255\d{9}$/.test(cleanPhone)) {
      throw new Error("Invalid phone number format");
    }

    let provider: "Airtel" | "Tigo" | "Halopesa" | "Mpesa" =
      "Mpesa";

    if (
      cleanPhone.startsWith("25574") ||
      cleanPhone.startsWith("25575") ||
      cleanPhone.startsWith("25576")
    ) {
      provider = "Mpesa";
    } else if (
      cleanPhone.startsWith("25568") ||
      cleanPhone.startsWith("25569") ||
      cleanPhone.startsWith("25578")
    ) {
      provider = "Airtel";
    } else if (
      cleanPhone.startsWith("25565") ||
      cleanPhone.startsWith("25567") ||
      cleanPhone.startsWith("25571")
    ) {
      provider = "Tigo";
    } else if (
      cleanPhone.startsWith("25562") ||
      cleanPhone.startsWith("25561")
    ) {
      provider = "Halopesa";
    }

    return await prisma.$transaction(async (tx) => {
      await tx.subscription.updateMany({
        where: {
          userId,
          status: "cancelled",
        },
        data: {
          status: "expired",
          autoRenew: false,
        },
      });

      const reference = `SUB-${Date.now()}-${Math.random()
        .toString(36)
        .substring(2, 10)}`;

      const subscription =
        await tx.subscription.create({
          data: {
            userId,
            tier,
            price: tierInfo.price,
            status: "pending_payment",
            startDate: new Date(),
            endDate: new Date(
              Date.now() + 30 * 24 * 60 * 60 * 1000
            ),
            autoRenew: true,
            paymentMethod: "mobile_money",
          },
        });

      await tx.subscriptionTransaction.create({
        data: {
          subscriptionId: subscription.id,
          userId,
          amount: tierInfo.price,
          status: "pending",
          reference,
          periodStart: new Date(),
          periodEnd: new Date(
            Date.now() + 30 * 24 * 60 * 60 * 1000
          ),
        },
      });

      const isSandbox =
        process.env.AZAMPAY_ENVIRONMENT === "sandbox";

      if (isSandbox) {
        console.log(
          "🔧 Sandbox mode: Auto-completing payment in 3 seconds..."
        );

        setTimeout(async () => {
          try {
            await this.confirmPayment(
              reference,
              true,
              `SANDBOX_${Date.now()}`
            );

            console.log(
              `✅ Sandbox payment auto-completed for reference: ${reference}`
            );
          } catch (error) {
            console.error(
              "Failed to auto-complete sandbox payment:",
              error
            );
          }
        }, 3000);

        return {
          success: true,
          requiresPaymentConfirmation: true,
          subscription,
          payment: {
            id: subscription.id,
            reference,
            transactionId: `SANDBOX_${Date.now()}`,
            status: "pending",
            message:
              "Sandbox mode: Payment will be auto-completed in 3 seconds.",
          },
        };
      }

      const azamPayResult =
        await AzamPayService.initiatePayment(
          tierInfo.price,
          cleanPhone,
          reference,
          `Subscription: ${tierInfo.name}`,
          provider
        );

      return {
        success: true,
        requiresPaymentConfirmation: true,
        subscription,
        payment: {
          id: subscription.id,
          reference,
          transactionId: azamPayResult.transactionId,
          status: "pending",
          message: `STK push sent to ${phone}. Please check your phone and enter PIN.`,
        },
      };
    });
  }

  async confirmPayment(
    reference: string,
    success: boolean,
    transactionId?: string
  ): Promise<any> {
    const subscriptionTx =
      await prisma.subscriptionTransaction.findFirst({
        where: { reference },
      });

    if (!subscriptionTx) {
      throw new Error(
        "Subscription transaction not found"
      );
    }

    if (subscriptionTx.status === "completed") {
      return {
        success: true,
        message: "Already confirmed",
      };
    }

    return await prisma.$transaction(async (tx) => {
      if (success) {
        await tx.subscriptionTransaction.update({
          where: { id: subscriptionTx.id },
          data: {
            status: "completed",
          },
        });

        const subscription =
          await tx.subscription.update({
            where: {
              id: subscriptionTx.subscriptionId,
            },
            data: {
              status: "active",
              startDate: new Date(),
              endDate: new Date(
                Date.now() + 30 * 24 * 60 * 60 * 1000
              ),
            },
          });

        const user = await prisma.user.findUnique({
          where: { id: subscription.userId },
        });

        if (user?.phone) {
          const { SMSService } =
            await import("../../services/sms.service");

          await SMSService.sendRealSMS(
            user.phone,
            `✅ Subscription activated! Plan: ${subscription.tier}. Next renewal: ${subscription.endDate.toLocaleDateString()}`
          );
        }

        await this.applyWelcomeBenefits(
          subscription.userId,
          subscription.tier
        );

        return {
          success: true,
          subscription,
        };
      }

      await tx.subscriptionTransaction.update({
        where: { id: subscriptionTx.id },
        data: { status: "failed" },
      });

      await tx.subscription.update({
        where: {
          id: subscriptionTx.subscriptionId,
        },
        data: {
          status: "failed",
        },
      });

      return {
        success: false,
        message: "Payment failed",
      };
    });
  }

  async getCardTopupStatus(
    reference: string
  ): Promise<any> {
    const tx = await prisma.cardTransaction.findFirst({
      where: {
        reference,
        type: CardTransactionType.TOPUP,
      },
    });

    if (!tx) {
      return {
        status: "not_found",
        completed: false,
        failed: false,
      };
    }

    return {
      status: tx.status,
      completed: tx.status === "completed",
      failed: tx.status === "failed",
      processing: tx.status === "processing",
      expired:
        !!tx.expiresAt &&
        tx.expiresAt < new Date(),
      amount: tx.amount,
      createdAt: tx.createdAt,
    };
  }

  async getPaymentStatus(
    reference: string
  ): Promise<any> {
    const subscriptionTx =
      await prisma.subscriptionTransaction.findFirst({
        where: { reference },
      });

    if (!subscriptionTx) {
      return {
        status: "not_found",
      };
    }

    return {
      status: subscriptionTx.status,
      completed: subscriptionTx.status === "completed",
      failed: subscriptionTx.status === "failed",
    };
  }

  async cancelSubscription(
    userId: string
  ): Promise<void> {
    const subscription =
      await prisma.subscription.findFirst({
        where: {
          userId,
          status: "active",
        },
      });

    if (!subscription) {
      throw new Error(
        "No active subscription found"
      );
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: "cancelled",
        autoRenew: false,
        updatedAt: new Date(),
        endDate: new Date(),
      },
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (user?.phone) {
      const { SMSService } =
        await import("../../services/sms.service");

      await SMSService.sendRealSMS(
        user.phone,
        `⚠️ Your ${subscription.tier} subscription has been cancelled. You will lose benefits immediately.`
      );
    }
  }

  async upgradeSubscription(
    userId: string,
    newTier: string
  ): Promise<any> {
    const currentSub =
      await prisma.subscription.findFirst({
        where: {
          userId,
          status: "active",
        },
      });

    if (!currentSub) {
      throw new Error("No active subscription found");
    }

    if (currentSub.tier === newTier) {
      throw new Error(
        `You are already on ${newTier} plan`
      );
    }

    const newTierInfo =
      SUBSCRIPTION_TIERS[newTier];

    if (!newTierInfo) {
      throw new Error("Invalid tier");
    }

    const daysRemaining = Math.ceil(
      (currentSub.endDate.getTime() - Date.now()) /
        (1000 * 60 * 60 * 24)
    );

    const currentPrice =
      Number(currentSub.price);

    const newPrice = newTierInfo.price;

    const proratedAmount =
      ((newPrice - currentPrice) / 30) *
      daysRemaining;

    if (proratedAmount > 0) {
      const card =
        await this.getOrCreateHuriaCard(userId);

      if (
        Number(card.balance) <
        proratedAmount
      ) {
        throw new Error(
          `Insufficient balance. Need TSh ${proratedAmount.toLocaleString()} to upgrade. Please top up your HURIA Card.`
        );
      }

      await this.payWithCard(
        userId,
        proratedAmount
      );
    }

    const updated =
      await prisma.subscription.update({
        where: { id: currentSub.id },
        data: {
          tier: newTier,
          price: newTierInfo.price,
          updatedAt: new Date(),
        },
      });

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (user?.phone) {
      const { SMSService } =
        await import("../../services/sms.service");

      await SMSService.sendRealSMS(
        user.phone,
        `🎉 Congratulations! You've upgraded to ${newTierInfo.name}. Your new benefits are now active!`
      );
    }

    return {
      success: true,
      subscription: updated,
      proratedAmount:
        proratedAmount > 0
          ? proratedAmount
          : 0,
    };
  }

  async getCurrentSubscription(
    userId: string
  ): Promise<any> {
    const subscription =
      await prisma.subscription.findFirst({
        where: {
          userId,
          status: "active",
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
        },
      });

    if (!subscription) {
      return null;
    }

    const tierInfo =
      SUBSCRIPTION_TIERS[subscription.tier];

    const daysRemaining = Math.ceil(
      (subscription.endDate.getTime() -
        Date.now()) /
        (1000 * 60 * 60 * 24)
    );

    if (
      daysRemaining <= 2 &&
      daysRemaining > 0
    ) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (user?.phone) {
        const { SMSService } =
          await import("../../services/sms.service");

        await SMSService.sendRealSMS(
          user.phone,
          `⏰ Your ${subscription.tier} subscription expires in ${daysRemaining} day(s). Renew now to continue enjoying benefits!`
        );
      }
    }

    return {
      ...subscription,
      benefits: tierInfo?.benefits,
      daysRemaining,
      tierInfo,
    };
  }

  async getAvailableTiers(): Promise<any[]> {
    return Object.entries(
      SUBSCRIPTION_TIERS
    ).map(([key, value]) => ({
      id: key,
      name: value.name,
      price: value.price,
      benefits: value.benefits,
    }));
  }

  async processMonthlyRenewals(): Promise<void> {
    console.log(
      "🔄 Processing monthly subscription renewals..."
    );

    const expiringSubscriptions =
      await prisma.subscription.findMany({
        where: {
          status: "active",
          autoRenew: true,
          endDate: {
            lte: new Date(
              Date.now() + 24 * 3600000
            ),
          },
        },
        include: {
          user: true,
        },
      });

    for (const sub of expiringSubscriptions) {
      try {
        const tierInfo =
          SUBSCRIPTION_TIERS[sub.tier];

        if (!tierInfo) {
          continue;
        }

        const card =
          await prisma.huriaCard.findUnique({
            where: {
              userId: sub.userId,
            },
          });

        if (
          card &&
          Number(card.balance) >=
            tierInfo.price
        ) {
          await this.payWithCard(
            sub.userId,
            tierInfo.price
          );

          const newEndDate =
            new Date(sub.endDate);

          newEndDate.setDate(
            newEndDate.getDate() + 30
          );

          await prisma.subscription.update({
            where: { id: sub.id },
            data: {
              startDate: sub.endDate,
              endDate: newEndDate,
              updatedAt: new Date(),
            },
          });

          await prisma.subscriptionTransaction.create(
            {
              data: {
                subscriptionId: sub.id,
                userId: sub.userId,
                amount: tierInfo.price,
                status: "completed",
                periodStart: sub.endDate,
                periodEnd: newEndDate,
                reference: `AUTO-RENEW-${Date.now()}`,
              },
            }
          );

          console.log(
            `✅ Auto-renewed subscription ${sub.id} from card`
          );

          if (sub.user?.phone) {
            const { SMSService } =
              await import("../../services/sms.service");

            await SMSService.sendRealSMS(
              sub.user.phone,
              `🔄 Your ${sub.tier} subscription has been auto-renewed! Next payment: ${newEndDate.toLocaleDateString()}`
            );
          }
        } else {
          await prisma.subscription.update({
            where: { id: sub.id },
            data: {
              autoRenew: false,
            },
          });

          if (sub.user?.phone) {
            const { SMSService } =
              await import("../../services/sms.service");

            await SMSService.sendRealSMS(
              sub.user.phone,
              `⚠️ Your ${sub.tier} subscription renewal failed due to insufficient HURIA Card balance. Please top up your card to renew.`
            );
          }

          await prisma.notification.create({
            data: {
              userId: sub.userId,
              type: "subscription_renewal_failed",
              title: "Subscription Renewal Failed",
              message: `Your ${sub.tier} subscription could not be renewed. Please top up your HURIA Card.`,
              data: {
                subscriptionId: sub.id,
              },
            },
          });
        }
      } catch (error) {
        console.error(
          `Failed to renew subscription ${sub.id}:`,
          error
        );
      }
    }
  }

  private async applyWelcomeBenefits(
    userId: string,
    tier: string
  ): Promise<void> {
    const benefits =
      SUBSCRIPTION_TIERS[tier]?.benefits;

    if (!benefits) {
      return;
    }

    if (benefits.monthlyCredits > 0) {
      const card =
        await this.getOrCreateHuriaCard(userId);

      await prisma.huriaCard.update({
        where: { id: card.id },
        data: {
          balance: {
            increment:
              benefits.monthlyCredits,
          },
        },
      });
    }
  }

  // ============================================================
  // PROMO CODE METHODS
  // ============================================================

  async validatePromoCode(
    code: string,
    userId: string,
    subtotal: number,
    merchantId?: string
  ): Promise<any> {
    const promo =
      await prisma.promoCode.findFirst({
        where: {
          code: code.toUpperCase(),
          isActive: true,
          startDate: { lte: new Date() },
          endDate: { gte: new Date() },
          OR: [
            { merchantId: null },
            { merchantId },
          ],
        },
      });

    if (!promo) {
      return {
        valid: false,
        message: "Invalid or expired promo code",
      };
    }

    const userUsedCount =
      await prisma.promoUsage.count({
        where: {
          promoId: promo.id,
          userId,
        },
      });

    if (
      userUsedCount >=
      promo.usagePerUser
    ) {
      return {
        valid: false,
        message: `You have already used this promo code. Max ${promo.usagePerUser} time(s)`,
      };
    }

    if (promo.usageLimit) {
      const totalUsed =
        await prisma.promoUsage.count({
          where: {
            promoId: promo.id,
          },
        });

      if (
        totalUsed >=
        promo.usageLimit
      ) {
        return {
          valid: false,
          message:
            "Promo code has reached usage limit",
        };
      }
    }

    if (
      promo.minOrderAmount &&
      subtotal <
        promo.minOrderAmount.toNumber()
    ) {
      return {
        valid: false,
        message: `Minimum order of TSh ${promo.minOrderAmount.toNumber().toLocaleString()} required`,
      };
    }

    let discountAmount = 0;
    let discountPercentage = 0;

    if (
      promo.discountType ===
      "percentage"
    ) {
      discountPercentage =
        promo.discountValue;

      discountAmount =
        (subtotal *
          promo.discountValue) /
        100;

      if (
        promo.maxDiscount &&
        discountAmount >
          promo.maxDiscount.toNumber()
      ) {
        discountAmount =
          promo.maxDiscount.toNumber();
      }
    } else {
      discountAmount = Math.min(
        promo.discountValue,
        subtotal
      );
    }

    return {
      valid: true,
      promo: {
        id: promo.id,
        code: promo.code,
        discountType:
          promo.discountType,
        discountValue:
          promo.discountValue,
        discountPercentage,
        discountAmount,
        description:
          promo.discountType ===
          "percentage"
            ? `${discountPercentage}% OFF`
            : `TSh ${discountAmount.toLocaleString()} OFF`,
      },
    };
  }

  async applyPromoCode(
    code: string,
    userId: string,
    subtotal: number,
    merchantId?: string
  ): Promise<any> {
    const validation =
      await this.validatePromoCode(
        code,
        userId,
        subtotal,
        merchantId
      );

    if (!validation.valid) {
      throw new Error(
        validation.message
      );
    }

    return validation.promo;
  }

  async recordPromoUsage(
    promoId: string,
    userId: string,
    orderId: string,
    discountAmount: number
  ): Promise<void> {
    await prisma.promoUsage.create({
      data: {
        promoId,
        userId,
        orderId,
        discountAmount,
      },
    });
  }

  async applyOrderBenefits(
    orderData: {
      subtotal: number;
      deliveryFee: number;
    },
    userId: string,
    appliedPromoCode?: {
      id: string;
      discountValue: number;
      discountType: string;
    }
  ): Promise<OrderBenefits> {
    const {
      subtotal,
      deliveryFee: originalDeliveryFee,
    } = orderData;

    let discountPercentage = 0;
    let freeDelivery = false;
    let subscriptionTier:
      | string
      | undefined;

    let welcomePromoApplied = false;
    let promoApplied = false;
    let promoId:
      | string
      | undefined;

    const subscription =
      await prisma.subscription.findFirst({
        where: {
          userId,
          status: "active",
          startDate: {
            lte: new Date(),
          },
          endDate: {
            gte: new Date(),
          },
        },
      });

    if (subscription) {
      const tierInfo =
        SUBSCRIPTION_TIERS[
          subscription.tier
        ];

      if (tierInfo) {
        discountPercentage =
          tierInfo.benefits
            .discountPercentage;

        freeDelivery =
          tierInfo.benefits.freeDelivery;

        subscriptionTier =
          subscription.tier;
      }
    }

    if (
      appliedPromoCode &&
      appliedPromoCode.discountValue >
        discountPercentage
    ) {
      discountPercentage =
        appliedPromoCode.discountValue;

      promoApplied = true;
      promoId =
        appliedPromoCode.id;
    }

    const discountAmount =
      (subtotal *
        discountPercentage) /
      100;

    const finalAmount =
      subtotal - discountAmount;

    const deliveryFee = freeDelivery
      ? 0
      : originalDeliveryFee;

    const totalAmount =
      finalAmount + deliveryFee;

    return {
      discountPercentage,
      discountAmount,
      finalAmount: totalAmount,
      freeDelivery,
      deliveryFee,
      welcomePromoApplied,
      promoApplied,
      promoId,
      subscriptionTier,
    };
  }
}

export default new SubscriptionService();