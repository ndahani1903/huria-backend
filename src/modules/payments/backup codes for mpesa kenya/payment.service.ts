import { prisma } from '../../config/db';
import { OrderService } from "../orders/order.service";
import { io } from "../../server";
import { SMSService } from '../../services/sms.service';
import { v4 as uuidv4 } from 'uuid';
import { Decimal } from "@prisma/client/runtime/library";
import redis from "../../config/redis";

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

    if (existing) {
      // Return existing payment with appropriate status
      return {
        payment: existing,
        message: this.getPaymentStatusMessage(existing.status)
      };
    }

   // ✅ ONLY CREATE PAYMENT RECORD - NO ORDER STATUS CHANGE
    const payment = await prisma.payment.create({
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

  console.log(`📝 Payment record created for order ${order.orderId}: ${amount} TZS (PENDING)`);

    return {
      payment,
      message: 'Payment initiated. Awaiting confirmation from M-Pesa.'
    };
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

    const updated = await prisma.payment.update({
      where: { orderId },
      data: {
        status: 'completed',
        transactionRef: transactionRef,
        gatewayReference: mpesaReceipt || transactionRef,
        completedAt: new Date(),
        updatedAt: new Date()
      },
    });

    console.log(`✅ Payment marked COMPLETED for order ${orderId}: ${transactionRef}`);

    return updated;
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
      where: { orderId },
    });

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status !== 'completed') {
      throw new Error('Order not completed yet');
    }

    if (otp !== order.otp) {
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

    if (payment.status !== 'completed') {
      throw new Error('Only completed payments can be refunded');
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

/*
  // Instance method for advanced payment processing with idempotency
  async processPayment(
      userId: string,
      orderId: string,
      amount: number,
      paymentMethod: string,
     idempotencyKey: string,
     metadata?: any
  ) {
    // Validate idempotency key format
    if (!this.isValidIdempotencyKey(idempotencyKey)) {
      throw new Error('Invalid idempotency key format');
    }

    // Check Redis for existing processing
    const processingKey = `payment:processing:${idempotencyKey}`;
    const existingProcessing = await redis.get(processingKey);
    
    if (existingProcessing) {
      return {
        status: 'processing',
        message: 'Payment is already being processed',
        idempotencyKey
      };
    }

    // Set processing lock with TTL
    await redis.setex(processingKey, this.PAYMENT_TIMEOUT / 1000, 'processing');

    try {
      // Check database for existing payment
      const existingPayment = await prisma.payment.findUnique({
        where: { idempotencyKey },
        include: {  }
      });

      if (existingPayment) {
        await redis.del(processingKey);
        return {
          status: existingPayment.status,
          paymentId: existingPayment.id,
          amount: existingPayment.amount,
          message: this.getStatusMessage(existingPayment.status),
          idempotencyKey
        };
      }

      // Execute payment in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Lock user's wallet for update
        const wallet = await tx.wallet.findUnique({
          where: { userId },
          select: { balance: true, id: true },
        });

        if (!wallet) {
          throw new Error('Wallet not found');
        }

       if (new Decimal(wallet.balance).lessThan(amount)) {
          throw new Error('Insufficient funds');
        }

        // Create payment record
       const payment = await tx.payment.create({
         data: {
            id: uuidv4(),
            userId: userId,
            orderId: orderId,
            amount,
            status: 'pending',
            paymentMethod,
            idempotencyKey,
            metadata: metadata || {},
            createdAt: new Date(),
             updatedAt: new Date()
            }
         });
    

        // Process with external payment gateway
        let gatewayResult;
        try {
          gatewayResult = await this.processWithPaymentGateway(payment, paymentMethod);
        } catch (gatewayError: any) {
          await tx.payment.update({
            where: { id: payment.id },
            data: { 
              status: 'failed',
              failureReason: gatewayError.message,
              updatedAt: new Date()
            }
          });
          throw gatewayError;
        }

        // Update wallet balance
        const newBalance = toNumber(wallet.balance) - amount;
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { 
            balance: newBalance,
            updatedAt: new Date()
          }
        });

        // Create transaction record
        const transaction = await tx.transaction.create({
          data: {
            id: uuidv4(),
            walletId: wallet.id,
            paymentId: payment.id,
            type: 'debit',
            amount,
            balanceAfter: newBalance,
            reference: gatewayResult.reference,
            status: 'completed',
            createdAt: new Date()
          }
        });

        // Update payment status
        const updatedPayment = await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'completed',
            gatewayReference: gatewayResult.reference,
            completedAt: new Date(),
            updatedAt: new Date()
          }
        });

        // Create audit log (if table exists)
   await tx.auditLog.create({
      data: {
        id: uuidv4(),
        adminId: userId,  // ✅ Use adminId instead of userId
        action: 'payment_completed',
        targetType: 'payment',  // ✅ Use targetType instead of entityType
      targetId: payment.id,   // ✅ Use targetId instead of entityId
    meta: {
      amount,
      paymentMethod,
      balanceAfter: newBalance
    },
    createdAt: new Date()
  }
});

 return { payment: updatedPayment, transaction, gatewayResult };
  });

      // Clear processing lock
      await redis.del(processingKey);
      
      // Cache successful payment
      await this.cachePaymentResult(result.payment.id, result.payment);
      
      // Invalidate user wallet cache
      await redis.del(`wallet:${userId}`);
      
      // Trigger async events
      await this.triggerPostPaymentEvents(result.payment, result.transaction);

      return {
        status: 'completed',
        paymentId: result.payment.id,
        transactionId: result.transaction.id,
        amount: result.payment.amount,
        balanceAfter: result.transaction.balanceAfter,
        reference: result.gatewayResult.reference,
        message: 'Payment processed successfully',
        idempotencyKey
      };
    } catch (error: any) {
      // Clear processing lock on error
      await redis.del(processingKey);
      
      // Log error for monitoring
      console.error('Payment processing failed:', {
        idempotencyKey,
        userId,
        amount,
        error: error.message,
        stack: error.stack
      });
      
      throw error;
    }
  }

  private async processWithPaymentGateway(payment: any, method: string) {
    // Simulate payment gateway integration
    // In production, integrate with M-Pesa, Stripe, etc.
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Gateway timeout')), 30000);
    });
    
    const gatewayPromise = new Promise((resolve) => {
      // Simulate gateway processing
      setTimeout(() => {
        resolve({
          reference: `GATEWAY_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          status: 'success',
          timestamp: new Date().toISOString()
        });
      }, 1000);
    });
    
    return Promise.race([gatewayPromise, timeoutPromise]);
  }

  private async cachePaymentResult(paymentId: string, payment: any) {
    const cacheKey = `payment:${paymentId}`;
    await redis.setex(cacheKey, this.IDEMPOTENCY_TTL, JSON.stringify(payment));
  }

  private async triggerPostPaymentEvents(payment: any, transaction: any) {
    // Emit WebSocket event for real-time updates
    try {
      const { io: socketIO } = require('../../server');
      socketIO.to(`user:${payment.userId}`).emit('payment:completed', {
        paymentId: payment.id,
        amount: payment.amount,
        balanceAfter: transaction.balanceAfter,
        timestamp: payment.completedAt
      });
    } catch (err) {
      console.error('WebSocket emit failed:', err);
    }
    
    // Queue for notifications
    await this.queueNotification(payment.userId, 'payment_success', {
      amount: payment.amount,
      reference: payment.gatewayReference
    });
  }

  private isValidIdempotencyKey(key: string): boolean {
    // UUID v4 format validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(key);
  }

  private getStatusMessage(status: string): string {
    const messages: Record<string, string> = {
      pending: 'Payment is being processed',
      completed: 'Payment completed successfully',
      failed: 'Payment failed',
      refunded: 'Payment has been refunded'
    };
    return messages[status] || 'Unknown payment status';
  }

  private async queueNotification(userId: string, type: string, data: any) {
    // Queue for async processing (optional - only if bull is installed)
    try {
      const Queue = require('bull');
      const notificationQueue = new Queue('notifications');
      await notificationQueue.add({
        userId,
        type,
        data,
        timestamp: new Date()
      });
    } catch (err) {
      console.error('Notification queuing failed:', err);
      // Fallback: just log instead of throwing
    }
  }
}

// Middleware to generate idempotency key
export const idempotencyMiddleware = (req: any, res: any, next: any) => {
  let idempotencyKey = req.headers['idempotency-key'];
  
  if (!idempotencyKey) {
    // Generate if not provided
    idempotencyKey = uuidv4();
    req.headers['idempotency-key'] = idempotencyKey;
  }
  
  // Add to request object
  req.idempotencyKey = idempotencyKey;
  next();
};*/