import { Request, Response } from 'express';
import { MpesaService } from './mpesa.service';
import { PaymentService } from './payment.service';
import { WebhookService } from './webhook.service';
import { prisma } from '../../config/db';
import { stkPushSchema } from './payment.validator';
import { AuthRequest } from '../../middleware/auth.middleware';

export class PaymentController {
  // ✅ FIXED: Initiate STK Push
  static async stkPush(req: AuthRequest, res: Response) {
console.log("🔥🔥🔥 STK PUSH CONTROLLER HIT 🔥🔥🔥");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);
  console.log("User:", req.user);

    try {
      console.log("📱 STK Push request received:", req.body);
      
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

      // Get amount from order if not provided
      let paymentAmount = amount;
      if (!paymentAmount || paymentAmount <= 0) {
        paymentAmount = Number(order.finalAmount || order.amount);
      }

// Use user's phone from order if not provided
    const userPhone = phone || order.user?.phone;
    if (!userPhone) {
      return res.status(400).json({ error: 'Phone number required' });
    }


      // Initiate payment (creates PENDING record)
      const result = await PaymentService.initiatePayment(orderId, phone, paymentAmount);

      // Send M-Pesa STK Push
      try {
        const gateway = await MpesaService.stkPush(userPhone, paymentAmount, order.orderId);
        
        res.json({
          success: true,
          paymentId: result.payment.id,
          status: result.payment.status,
          message: `STK push sent to ${userPhone}. Please check your phone and enter PIN.`,
          checkoutRequestId: gateway.data?.CheckoutRequestID
        });
      } catch (mpesaError: any) {
        console.error('M-Pesa STK Push failed:', mpesaError);
        
        // Mark payment as failed if STK push fails
        await PaymentService.markFailed(order.id, 'STK push failed');
        
        res.status(502).json({
          success: false,
          error: 'Failed to initiate M-Pesa payment. Please try again.',
          details: mpesaError.message
        });
      }

    } catch (error: any) {
      console.error('STK Push error:', error);
      res.status(500).json({ 
        error: 'STK push failed',
        details: error.response?.data || error.message,
      });
    }
  }

  // ✅ NEW: Payment status polling endpoint
  static async getPaymentStatus(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      
      if (!orderId) {
        return res.status(400).json({ error: 'Order ID required' });
      }
      
      const payment = await PaymentService.getByOrderId(orderId);
      const order = await prisma.order.findUnique({
        where: { orderId },
        select: { status: true, orderId: true }
      });
      
      if (!payment) {
        return res.status(404).json({ 
          status: 'not_found',
          message: 'No payment record found for this order'
        });
      }
      
      // Determine if client should continue polling
      const shouldContinuePolling = ['pending', 'processing'].includes(payment.status);
      
      res.json({
        orderId: orderId,
        paymentStatus: payment.status,
        orderStatus: order?.status,
        completedAt: payment.completedAt,
        transactionRef: payment.transactionRef,
        failureReason: payment.failureReason,
        shouldContinuePolling,
        message: payment.status === 'completed' 
          ? 'Payment successful!' 
          : payment.status === 'failed' 
            ? 'Payment failed. Please try again.'
            : 'Waiting for payment confirmation...'
      });
      
    } catch (error: any) {
      console.error('Payment status error:', error);
      res.status(500).json({ error: 'Failed to fetch payment status' });
    }
  }

  // ✅ M-Pesa Callback endpoint
  static async callback(req: Request, res: Response) {
    try {
      console.log("📞 M-Pesa Callback received");
      
      // Verify signature if needed
      const signature = req.headers['x-mpesa-signature'] as string;
      // if (signature) {
      //   const isValid = WebhookService.verifySignature(signature, req.body, process.env.MPESA_SECRET!);
      //   if (!isValid) {
      //     return res.status(401).json({ error: 'Invalid signature' });
      //   }
      // }
      
      const result = await WebhookService.handleCallback(req.body);
      res.json({ ResultCode: 0, ResultDesc: 'Success' });
    } catch (error) {
      console.error('Callback error:', error);
      // Always return 200 to M-Pesa to prevent retries
      res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }
  }

  // ✅ Release payment after OTP
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

  // ✅ Refund payment (admin only)
  static async refund(req: AuthRequest, res: Response) {
    try {
      const { orderId } = req.body;
      
      if (!orderId) {
        return res.status(400).json({ error: 'Order ID required' });
      }

      const result = await PaymentService.refund(orderId);
      res.json({ success: true, payment: result });
      
    } catch (error: any) {
      console.error('Refund error:', error);
      res.status(500).json({ error: error.message || 'Refund failed' });
    }
  }

  // ✅ Get payment details
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
  
  // ✅ NEW: Retry failed webhook (admin only)
  static async retryWebhook(req: AuthRequest, res: Response) {
    try {
      const { eventId } = req.params;
      
      const result = await WebhookService.retryFailedWebhook(eventId);
      res.json({ success: true, result });
      
    } catch (error: any) {
      console.error('Retry webhook error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // ✅ NEW: Get pending webhooks (admin only)
  static async getPendingWebhooks(req: AuthRequest, res: Response) {
    try {
      const webhooks = await WebhookService.getPendingWebhooks();
      res.json(webhooks);
    } catch (error: any) {
      console.error('Get pending webhooks error:', error);
      res.status(500).json({ error: error.message });
    }
  }
}