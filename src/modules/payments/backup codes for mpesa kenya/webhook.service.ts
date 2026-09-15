import { MpesaCallback } from './types';
import { PaymentService } from './payment.service';
import { OrderService } from '../orders/order.service';
import { EscrowService } from '../../services/escrow.service';
import { prisma } from "../../config/db";
import { io } from "../../server";
import { SMSService } from '../../services/sms.service';

export class WebhookService {
  static async handleCallback(data: MpesaCallback) {
     const callback = data.Body.stkCallback;
    const checkoutRequestId = callback.CheckoutRequestID;
    
    console.log(`📞 Webhook received for CheckoutRequestID: ${checkoutRequestId}`);
    console.log(`📞 ResultCode: ${callback.ResultCode}`);
     
    // ✅ IDEMPOTENCY CHECK - prevent duplicate processing
    const existingEvent = await prisma.webhookEvent.findUnique({
      where: { eventId: callback.CheckoutRequestID }
    });
    
   if (existingEvent && existingEvent.status === 'processed') {
      console.log(`⏭️ Webhook ${checkoutRequestId} already processed, skipping`);
      return { success: true, message: 'Already processed' };
    }


    // ✅ Extract orderId from CallbackMetadata (M-Pesa puts it in AccountReference)
    const items = callback.CallbackMetadata?.Item || [];
    
    const orderId = items.find(i => i.Name === "AccountReference")?.Value;
    const receipt = items.find(i => i.Name === "MpesaReceiptNumber")?.Value;
    const amount = items.find(i => i.Name === "Amount")?.Value;
    const phoneNumber = items.find(i => i.Name === "PhoneNumber")?.Value;
  
  console.log(`📦 Extracted - OrderId: ${orderId}, Receipt: ${receipt}, Amount: ${amount}`);
    
    if (!orderId) {
      console.error("❌ No orderId found in callback metadata");
      // Still record the webhook for audit
    await prisma.webhookEvent.upsert({
      where: { eventId: callback.CheckoutRequestID },
      update: {
        payload: data,
          status: 'failed',
          processedAt: new Date()
        },
      create: {
        provider: "mpesa",
          eventId: checkoutRequestId,
          payload: data,
          status: 'failed'
      }
      });
      return { success: false, error: 'No orderId in callback' };
    }

   // Create or update webhook event record
    await prisma.webhookEvent.upsert({
      where: { eventId: checkoutRequestId },
      update: {
        payload: data,
        status: 'processing'
      },
      create: {
        provider: "mpesa",
        eventId: checkoutRequestId,
        payload: data,
        status: 'processing'
      }
    });
        
    try {
       if (callback.ResultCode === 0) {
        // ✅ SUCCESSFUL PAYMENT
        console.log(`✅ Payment successful for order ${orderId}`);
        
        // ✅ Process successful payment
        await prisma.$transaction(async (tx) => {
          // 1. Mark payment as completed
          const payment = await tx.payment.update({
            where: { orderId },
            data: {
              status: 'completed',
              transactionRef: receipt,
              gatewayReference: receipt,
              completedAt: new Date(),
              updatedAt: new Date()
            },
          });
          
            console.log(`💰 Payment ${payment.id} marked as completed`);
          
          // 2. Mark order as paid
          const order = await tx.order.update({
            where: { orderId },
            data: { 
              status: 'paid',
              updatedAt: new Date()
            },
            include: { user: true }
          });
          
        console.log(`📦 Order ${orderId} marked as PAID`);
          
          // 3. Update webhook event status
          await tx.webhookEvent.update({
            where: { eventId: checkoutRequestId },
            data: { 
              status: 'processed',
              processedAt: new Date()
            }
          });

      // 4. Send SMS notification
          if (order.user?.phone) {
            await SMSService.sendPaymentReceived(order.user.phone, orderId, Number(amount || order.amount));
          }
        });

        
        // Hold in escrow (outside transaction to avoid long locks)
        try {
         const order = await prisma.order.findUnique({
          where: { orderId },
          select: { amount: true, userId: true }
        });
        if (order) {
            await EscrowService.holdPayment(orderId, PaymentService.toNumber(order.amount), order.userId);
            console.log(`🔒 Escrow held for order ${orderId}`);
          }
        } catch (escrowError) {
          console.error(`⚠️ Escrow hold failed for ${orderId}:`, escrowError);
          // Don't fail the webhook - payment is already confirmed
        }
          
       // ✅ Emit real-time update
        io.emit("order:update", { 
          orderId, 
          status: "paid",
          paymentStatus: "completed"
        });
        
        return { success: true, orderId, status: 'paid' };
        
      } else {
       // ❌ FAILED PAYMENT
        console.log(`❌ Payment failed for order ${orderId}: ResultCode ${callback.ResultCode}`);
        
        await prisma.$transaction(async (tx) => {
          // 1. Mark payment as failed
          await tx.payment.update({
            where: { orderId },
            data: {
              status: 'failed',
              failureReason: `M-Pesa ResultCode: ${callback.ResultCode}`,
              updatedAt: new Date()
            },
          });

      // 2. Update webhook event
          await tx.webhookEvent.update({
            where: { eventId: checkoutRequestId },
            data: { 
              status: 'failed',
              processedAt: new Date()
            }
          });
        });
        
        // ✅ Emit failure update
        io.emit("order:payment-failed", { 
          orderId, 
          reason: `Payment failed. Please try again.`
        });
        
        return { success: false, orderId, status: 'failed', resultCode: callback.ResultCode };
      }
      
    } catch (error: any) {
      console.error(`💥 Webhook processing error for ${orderId}:`, error);
      
      // Update webhook event as failed
      await prisma.webhookEvent.update({
        where: { eventId: checkoutRequestId },
        data: { 
          status: 'failed',
          processedAt: new Date()
        }
      });
      
      throw error;
    }
  }

// ✅ NEW: Verify M-Pesa webhook signature (security)
  static verifySignature(signature: string, body: any, secret: string): boolean {
    // Implement signature verification based on M-Pesa documentation
    // For now, return true - but implement properly in production
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(body))
      .digest('base64');
    
    return signature === expectedSignature;
  }
  
  // ✅ NEW: Retry failed webhook processing
  static async retryFailedWebhook(eventId: string): Promise<any> {
    const event = await prisma.webhookEvent.findUnique({
      where: { eventId }
    });
    
    if (!event) {
      throw new Error('Webhook event not found');
    }
    
    if (event.status !== 'failed') {
      throw new Error('Only failed webhooks can be retried');
    }
    
    // Reprocess the webhook
    return this.handleCallback(event.payload as MpesaCallback);
  }
  
  // ✅ NEW: Get pending/failed webhooks for monitoring
  static async getPendingWebhooks(limit: number = 100) {
    return prisma.webhookEvent.findMany({
      where: {
        status: { in: ['pending', 'failed'] }
      },
      orderBy: { createdAt: 'asc' },
      take: limit
    });
  }
}