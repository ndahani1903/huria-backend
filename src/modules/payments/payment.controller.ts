// src/modules/payments/payment.controller.ts

import { Request, Response } from 'express';
import { AzamPayService } from '../../services/azampay.service';
import { PaymentService } from './payment.service';
import { prisma } from '../../config/db';
import { stkPushSchema } from './payment.validator';
import { AuthRequest } from '../../middleware/auth.middleware';
import { SubscriptionService } from "../subscription/subscription.service";

export class PaymentController {
  // In payment.controller.ts - ADD THIS FOR TESTING ONLY
// ✅ SIMPLIFIED manual confirm - uses orderId only (for testing)
static async manualConfirmByOrderId(req: AuthRequest, res: Response) {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ error: 'Order ID required' });
    }
    
    // Find the payment
    const payment = await prisma.payment.findUnique({
      where: { orderId }
    });
    
    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }
    
    if (payment.status === 'completed') {
      return res.json({ success: true, message: 'Payment already completed' });
    }
    
    // Generate a mock transaction ID
    const mockTransactionId = `MANUAL_${Date.now()}`;
    
    // Mark payment as completed
    await PaymentService.markCompleted(orderId, mockTransactionId);
    
    // Update order status
    await prisma.order.update({
      where: { id: payment.orderId },
      data: { status: 'paid' }
    });
    
    
    res.json({ 
      success: true, 
      message: 'Payment confirmed manually',
      mockTransactionId 
    });
    
  } catch (error: any) {
    console.error('Manual confirm error:', error);
    res.status(500).json({ error: error.message });
  }
}


  // ✅ AZAMPAY INITIATE PAYMENT (TANZANIA)
  static async initiateAzamPayPayment(req: AuthRequest, res: Response) {
    console.log("🔥🔥🔥 AZAMPAY PAYMENT INITIATED 🔥🔥🔥");
    console.log("Body:", req.body);
    console.log("User:", req.user);

    try {
      const data = stkPushSchema.parse(req.body);
      const { orderId, amount, phone } = data;

      // Validate order exists
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { user: true }
      });
      
      if (!order) {
        console.error("❌ Order not found with UUID:", orderId);
        return res.status(404).json({ error: 'Order not found' });
      }
      
      console.log("✅ Order found:", order.orderId, "UUID:", order.id);


   // ✅ Check if order is already paid
    if (order.status === 'paid' || order.status === 'completed') {
      return res.status(400).json({ 
        error: 'ORDER_ALREADY_PAID',
        message: 'This order has already been paid for. Please check your orders list.'
      });
    }

      // Get payment amount
      let paymentAmount = amount;
      if (!paymentAmount || paymentAmount <= 0) {
        paymentAmount = Number(order.finalAmount || order.amount);
      }

      // Get user phone
      const userPhone = phone || order.user?.phone;
      if (!userPhone) {
        return res.status(400).json({ error: 'Phone number required' });
      }

      // Detect provider based on phone prefix (Tanzania)
      let provider: "Airtel" | "Tigo" | "Halopesa" | "Azampesa" | "Mpesa" = "Mpesa";
     
   // Clean the phone number properly
   let cleanPhone = userPhone.replace(/\s/g, '').replace(/^\+/, '');

   // Remove leading zeros
   while (cleanPhone.startsWith('0')) {
       cleanPhone = cleanPhone.substring(1);
      }

   // Add 255 if not present
   if (!cleanPhone.startsWith('255')) {
      cleanPhone = '255' + cleanPhone;
      }

   // Now check the 4 digits after 255 (or first 4 digits)
const phonePrefix = cleanPhone.substring(3, 7); // Gets digits after 255
    

   if (phonePrefix.startsWith('62') || phonePrefix.startsWith('63') ||   phonePrefix.startsWith('64')) {
  provider = "Halopesa";
 } else if (phonePrefix.startsWith('65') || phonePrefix.startsWith('67') || phonePrefix.startsWith('71')) {
  provider = "Tigo";
} else if (phonePrefix.startsWith('68') || phonePrefix.startsWith('69') || phonePrefix.startsWith('78')) {
  provider = "Airtel";
} else if (phonePrefix.startsWith('74') || phonePrefix.startsWith('75') || phonePrefix.startsWith('76')) {
  provider = "Mpesa";
}

console.log(`📱 Detected provider: ${provider} for phone: ${cleanPhone} (prefix: ${phonePrefix})`);

      // Create payment record (PENDING)
      const paymentResult = await PaymentService.initiatePayment(orderId, userPhone, paymentAmount);

      // Initiate AzamPay payment
      const azamPayResult = await AzamPayService.initiatePayment(
        paymentAmount,
        userPhone,
        order.orderId,
        order.user?.name || 'Customer',
        provider
      );

 console.log("📦 AzamPay result:", JSON.stringify(azamPayResult, null, 2));

      // Store AzamPay reference in payment metadata
      await prisma.payment.update({
        where: { id: paymentResult.payment.id },
        data: {
          metadata: {
            ...(paymentResult.payment.metadata as any || {}),
            azamPayTransactionId: azamPayResult.transactionId || azamPayResult.referenceId,
            provider: 'azampay',
            phoneNumber: userPhone,
            network: provider
          }
        }
      });

      res.json({
        success: true,
        paymentId: paymentResult.payment.id,
       transactionId: azamPayResult.transactionId || azamPayResult.referenceId || 'pending',
        status: paymentResult.payment.status,
        provider: provider,
        message: `STK push sent to ${userPhone}. Please check your phone and enter PIN.`
      });

    } catch (error: any) {
      console.error('AzamPay payment error:', error);

      // ✅ Handle duplicate payment errors with user-friendly message
    if (error.message === 'PAYMENT_ALREADY_COMPLETED') {
      return res.status(400).json({ 
        error: 'PAYMENT_ALREADY_COMPLETED',
        message: 'This order has already been paid for successfully.'
      });
    }
    
    if (error.message === 'PAYMENT_ALREADY_PENDING') {
      return res.status(400).json({ 
        error: 'PAYMENT_ALREADY_PENDING',
        message: 'A payment for this order is already in progress. Please wait or check your orders.'
      });
    }
    
    if (error.code === 'P2002') {
      return res.status(400).json({ 
        error: 'DUPLICATE_PAYMENT',
        message: 'A payment record for this order already exists. Please refresh and check your order status.'
      });
    }

      res.status(500).json({ 
        success: false,
        error: error.message || 'Payment initiation failed'
      });
    }
  }




  static async payOrderWithCard(
  req: AuthRequest,
  res: Response
) {

  try {

    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: "Order ID is required"
      });
    }


   const result =
      await subscriptionService
        .payOrderWithCard(
          userId,
          orderId
        );

    return res.json(result);

  } catch (error: any) {

    console.error(
      "Card payment error:",
      error
    );

    return res.status(400).json({
      success: false,
      message:
        error.message ||
        "Card payment failed"
    });

  }
}

  // ✅ AZAMPAY WEBHOOK HANDLER
  static async azamPayWebhook(req: Request, res: Response) {
    try {
      const payload = req.body;
      console.log("📞 AzamPay Webhook received:", payload);

      // AzamPay sends status in the payload
      // Common status values: "SUCCESS", "FAILED", "PENDING"
      if (payload.status === "SUCCESS") {
        const { merchantReference, transactionId, amount } = payload;

        // merchantReference is your orderId (business ID)
        // Find payment by orderId in metadata or by order
        const payment = await prisma.payment.findFirst({
          where: {
            metadata: {
              path: ['azamPayTransactionId'],
              equals: transactionId
            }
          }
        });

        if (payment) {
          await PaymentService.markCompleted(payment.orderId, transactionId);
          

          console.log(`✅ Payment confirmed via webhook for order ${payment.orderId}`);
        } else {
          console.warn(`⚠️ Payment not found for transaction: ${transactionId}`);
        }
      } else if (payload.status === "FAILED") {
        console.log(`❌ Payment failed: ${payload.failureReason || 'Unknown reason'}`);
      }

      // Always respond with 200 to stop retries
      res.status(200).json({ status: "success" });
    } catch (error) {
      console.error("Webhook error:", error);
      res.status(200).json({ status: "ok" });
    }
  }

  // ✅ CHECK PAYMENT STATUS (Polling)
  static async checkAzamPayStatus(req: Request, res: Response) {
    try {
      const { transactionId } = req.params;
      
      const status = await AzamPayService.checkStatus(transactionId);
      
      // Update payment status if needed
      if (status.status === "SUCCESS") {
        const payment = await prisma.payment.findFirst({
          where: {
            metadata: {
              path: ['azamPayTransactionId'],
              equals: transactionId
            }
          }
        });
        
        if (payment && payment.status !== 'completed') {
          await PaymentService.markCompleted(payment.orderId, transactionId);
          
        }
      }
      
      res.json({
        success: true,
        status: status.status,
        transactionId: transactionId
      });
    } catch (error: any) {
      console.error('Status check error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // ✅ GET PAYMENT STATUS (for order)
  static async getPaymentStatus(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      
      const payment = await PaymentService.getByOrderId(orderId);
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true }
      });
      
      if (!payment) {
        return res.status(404).json({ 
          status: 'not_found',
          message: 'No payment record found for this order'
        });
      }
      
      res.json({
        orderId: orderId,
        paymentStatus: payment.status,
        orderStatus: order?.status,
        completedAt: payment.completedAt,
        transactionRef: payment.transactionRef,
        failureReason: payment.failureReason
      });
    } catch (error: any) {
      console.error('Payment status error:', error);
      res.status(500).json({ error: 'Failed to fetch payment status' });
    }
  }

  // ✅ RELEASE PAYMENT (after OTP)
  static async release(req: AuthRequest, res: Response) {
    try {
      const { orderId, otp } = req.body;
      
      if (!orderId || !otp) {
        return res.status(400).json({ error: 'Order ID and OTP required' });
      }

      const result = await PaymentService.release(orderId, otp);
      res.json({ success: true, payment: result });
    } catch (error: any) {
      console.error('Release error:', error);
      res.status(500).json({ error: error.message || 'Release failed' });
    }
  }

  // ✅ REFUND PAYMENT
  static async refund(
  req: AuthRequest,
  res: Response
) {

  try {

    const { orderId } = req.body;

    if (!orderId) {

      return res.status(400).json({
        error: "Order ID required"
      });

    }

    const subscriptionService =  new SubscriptionService();

  try {
    const refundResult =
      await subscriptionService.refundCardPurchase(orderId);

   const paymentRefund =
      await PaymentService.refund(orderId);

    return res.json({
      success: true,
      refund: refundResult,
      payment: paymentRefund
    });

  } catch (error: any) {

    return res.status(400).json({
      success: false,
      error: error.message
    });
  }
} catch (error: any) {
    console.error('Refund error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Refund failed'
    });
  }
}

  // ✅ GET PAYMENT DETAILS
  static async getPayment(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const payment = await PaymentService.get(orderId);
      
      if (!payment) {
        return res.status(404).json({ error: 'Payment not found' });
      }
      
      res.json(payment);
    } catch (error: any) {
      console.error('Get payment error:', error);
      res.status(500).json({ error: 'Failed to fetch payment' });
    }
  }
}