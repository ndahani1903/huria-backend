// src/modules/payments/payment.service.ts

import { prisma } from '../../config/db';
import { OrderService } from "../orders/order.service";
import { io } from "../../server";
import { SMSService } from '../../services/sms.service';
import { v4 as uuidv4 } from 'uuid';
import { Decimal } from "@prisma/client/runtime/library";
import redis from "../../config/redis";
import bcrypt from 'bcrypt';

export const toNumber = (val: any): number => {
  if (!val) return 0;
  if (val instanceof Decimal) return val.toNumber();
  return Number(val);
};

export class PaymentService {
  private readonly IDEMPOTENCY_TTL = 86400; // 24 hours
  private readonly PAYMENT_TIMEOUT = 30000; // 30 seconds

  // Static method for basic payment initiation
  static async initiatePayment(orderIdOrUuid: string, phone: string, amount: number) {
console.log("🔍 Looking up order by UUID:", orderIdOrUuid);

    // Fetch order first to get user info
    const order = await prisma.order.findUnique({
      where: { id: orderIdOrUuid },
      include: { user: true }
    });

    if (!order) {
    console.error("❌ Order NOT found for UUID:", orderIdOrUuid);
    throw new Error('Order not found');
  }

  console.log("✅ Order found:", order.orderId, "UUID:", order.id);

    const existing = await prisma.payment.findUnique({
      where: { orderId: order.id },
    });


 // ✅ If payment already exists, return appropriate response
  if (existing) {
    if (existing.status === 'completed') {
      throw new Error('PAYMENT_ALREADY_COMPLETED');
    }
    if (existing.status === 'pending') {
      throw new Error('PAYMENT_ALREADY_PENDING');
    }
    if (existing.status === 'failed') {
      // Allow retry for failed payments - delete and create new
      await prisma.payment.delete({ where: { id: existing.id } });
      console.log(`🗑️ Deleted failed payment for order ${order.orderId}, allowing retry`);
    } else {
      return {
        payment: existing,
        message: this.getPaymentStatusMessage(existing.status)
      };
    }
  }

   // ✅ ONLY CREATE PAYMENT RECORD - NO ORDER STATUS CHANGE
   const payment = await prisma.$transaction(async (tx) => {
  return await tx.payment.create({
    data: {
      orderId: order.id,
      userId: order.userId,
      amount: amount,
      status: 'pending',
      paymentMethod: 'mpesa',
      createdAt: new Date(),
      updatedAt: new Date()
    },
  });
});

  console.log(`📝 Payment record created for order ${order.orderId}: ${amount} TZS (PENDING)`);

    return {
      payment,
      message: 'Payment initiated. Awaiting confirmation from M-Pesa.'
    };
  }


   static async completeOrderPayment(
  orderId: string,
  userId: string,
  amount: number,
  paymentMethod: string,
  transactionRef: string
) {

  return prisma.$transaction(async (tx) => {

    let payment = await tx.payment.findUnique({
      where: {
        orderId
      }
    });

    // Prevent duplicates
    if (payment?.status === "completed") {
      return payment;
    }

    if (!payment) {

      payment = await tx.payment.create({
        data: {
          orderId,
          userId,
          amount,
          status: "completed",
          paymentMethod,
          transactionRef,
          gatewayReference: transactionRef,
          completedAt: new Date()
        }
      });

    } else {

      payment = await tx.payment.update({
        where: {
          id: payment.id
        },
        data: {
          status: "completed",
          paymentMethod,
          transactionRef,
          gatewayReference: transactionRef,
          completedAt: new Date()
        }
      });

    }

    await tx.order.update({
      where: {
        id: orderId
      },
      data: {
        status: "paid"
      }
    });

    const order = await tx.order.findUnique({
      where: {
        id: orderId
      },
      select: {
        totalAmount: true,
        amount: true,
        deliveryFee: true,
        userId: true
      }
    });

    if (order) {

  const existingEscrow =
    await tx.escrow.findUnique({
      where: {
        orderId
      }
    });

  if (!existingEscrow) {

    const { EscrowService } =
      await import("../../services/escrow.service");

    const escrowAmount =
      Number(
        order.totalAmount ||
        Number(order.amount) +
        Number(order.deliveryFee || 0)
      );

    await EscrowService.holdPayment(
      orderId,
      escrowAmount,
      order.userId
    );
  }
}

  return {
      payment,
      order
    };

  });
}


 // ✅ NEW: Mark payment as completed (called from webhook)
  static async markCompleted(orderId: string, transactionRef: string, mpesaReceipt?: string) {
    const payment = await prisma.payment.findUnique({
      where: { orderId }
    });

    if (!payment) {
      throw new Error('Payment not found');
    }

    // Prevent double completion
    if (payment.status === 'completed') {
      console.log(`⚠️ Payment ${orderId} already completed, skipping`);
      return payment;
    }

    return await this.completeOrderPayment(
    orderId,
    payment.userId,
    Number(payment.amount),
    payment.paymentMethod || "mpesa",
    transactionRef
  );
  }

// ✅ NEW: Mark payment as failed (called from webhook)
  static async markFailed(orderId: string, reason: string | number) {
    const payment = await prisma.payment.findUnique({
      where: { orderId }
    });

    if (!payment) {
      throw new Error('Payment not found');
    }

    // Don't override completed status
    if (payment.status === 'completed') {
      console.log(`⚠️ Payment ${orderId} already completed, cannot mark as failed`);
      return payment;
    }

    const updated = await prisma.payment.update({
      where: { orderId },
      data: {
        status: 'failed',
        failureReason: String(reason),
        updatedAt: new Date()
      },
    });

    console.log(`❌ Payment marked FAILED for order ${orderId}: ${reason}`);

    return updated;
  }

  // ✅ FIXED: markHeld (called after payment completion)
  static async markHeld(orderId: string, ref: string) {
    return prisma.payment.update({
      where: { orderId },
      data: {
        status: 'held',
        transactionRef: ref,
        updatedAt: new Date()
      },
    });
  }

  // ✅ FIXED: release (only after OTP verification)
  static async release(orderId: string, otp: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status !== 'completed') {
      throw new Error('Order not completed yet');
    }

    const isValidOtp = await bcrypt.compare(otp, order.otp);

    if (!isValidOtp) {
      throw new Error('Invalid OTP');
    }

    const payment = await prisma.payment.update({
      where: { orderId },
      data: { 
        status: 'released',
        updatedAt: new Date()
      },
    });

    console.log(`💰 Payment RELEASED for order ${orderId}`);

    return payment;
  }

  // ✅ refund method
  static async refund(orderId: string) {
    const payment = await prisma.payment.findUnique({
      where: { orderId },
    });

    if (!payment) {
      throw new Error('Payment not found');
    }

   if (payment.status === 'refunded') {
  throw new Error('Payment already refunded');
}


    if (
  payment.status !== 'completed' &&
  payment.status !== 'held' &&
  payment.status !== 'released'
) {
  throw new Error(
    'Only completed, held or released payments can be refunded'
  );
}

    const updated = await prisma.payment.update({
      where: { orderId },
      data: { 
        status: 'refunded',
        updatedAt: new Date()
      },
    });

    await prisma.refund.create({
      data: {
        paymentId: payment.id,
        amount: payment.amount,
        reason: 'Admin refund',
        status: 'completed',
        metadata: {
  refundedAt: new Date().toISOString()
},
        createdAt: new Date()
      },
    });

    console.log(`🔄 Payment REFUNDED for order ${orderId}`);

    return updated;
  }


static async getByOrderId(orderId: string) {
  return prisma.payment.findUnique({
    where: { orderId },
  });
}

 // ✅ Get payment with full details
  static async get(orderId: string) {
    return prisma.payment.findUnique({
      where: { orderId },
      include: {
        order: {
          select: {
            orderId: true,
            status: true,
            amount: true,
            finalAmount: true
          }
        },
        transactions: true,
        refunds: true
      }
    });
  }

 // ✅ Helper: Get status message
  private static getPaymentStatusMessage(status: string): string {
    const messages: Record<string, string> = {
      pending: 'Payment pending. Waiting for M-Pesa confirmation.',
      processing: 'Payment is being processed.',
      completed: 'Payment completed successfully.',
      failed: 'Payment failed. Please try again.',
      held: 'Payment held in escrow.',
      released: 'Payment released to merchant/driver.',
      refunded: 'Payment has been refunded.'
    };
    return messages[status] || 'Unknown payment status';
  }

  // ✅ Check if order has valid payment
  static async isOrderPaid(orderId: string): Promise<boolean> {
    const payment = await prisma.payment.findUnique({
      where: { orderId },
      select: { status: true }
    });
    
    return payment?.status === 'completed';
  }
}
