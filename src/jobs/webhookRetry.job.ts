// src/jobs/webhookRetry.job.ts
import { prisma } from '../config/db';
import { PaymentService } from '../modules/payments/payment.service';
import { AzamPayService } from '../services/azampay.service';

export async function retryFailedPayments() {
  console.log('🔄 Running payment retry job...', new Date().toISOString());
  
  // Find payments that are stuck in pending state for more than 10 minutes
  const stuckPayments = await prisma.payment.findMany({
    where: {
      status: 'pending',
      paymentMethod: 'mobile_money',
      createdAt: {
        lt: new Date(Date.now() - 10 * 60 * 1000) // Pending for > 10 minutes
      }
    },
    take: 50
  });
  
  console.log(`📋 Found ${stuckPayments.length} stuck payments to check`);
  
  for (const payment of stuckPayments) {
    try {
      const transactionId = (payment.metadata as any)?.azamPayTransactionId;
      if (!transactionId) {
        console.log(`⚠️ No transaction ID for payment ${payment.id}`);
        continue;
      }
      
      // Check status with AzamPay
      const status = await AzamPayService.checkStatus(transactionId);
      
      if (status.status === 'SUCCESS') {
        await PaymentService.markCompleted(payment.orderId, transactionId);
        await prisma.order.update({
          where: { id: payment.orderId },
          data: { status: 'paid' }
        });
        console.log(`✅ Confirmed stuck payment for order ${payment.orderId}`);
      } else if (status.status === 'FAILED') {
        await PaymentService.markFailed(payment.orderId, 'Payment failed');
        console.log(`❌ Marked failed payment for order ${payment.orderId}`);
      }
      
    } catch (error) {
      console.error(`Failed to check payment ${payment.id}:`, error);
    }
  }
}

// Run every 10 minutes
if (process.env.NODE_ENV !== 'test') {
  setInterval(retryFailedPayments, 10 * 60 * 1000);
  console.log('⏰ Payment retry job scheduled (every 10 minutes)');
}