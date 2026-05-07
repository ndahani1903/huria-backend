import { MpesaCallback } from './types';
import { PaymentService } from './payment.service';
import { OrderService } from '../orders/order.service';
import { prisma } from "../../config/db";

export class WebhookService {
  static async handleCallback(data: MpesaCallback) {
     const callback = data.Body.stkCallback;
     const orderId = callback.CheckoutRequestID;

     const existing = await prisma.webhookEvent.findUnique({
    where: { eventId: callback.CheckoutRequestID }
  });

    if (existing) {
    return;
  }

    await prisma.webhookEvent.create({
    data: {
      provider: "mpesa",
      eventId: callback.CheckoutRequestID
    }
  });

     if (callback.ResultCode === 0) {
      const items = callback.CallbackMetadata?.Item || [];

      const receipt = items.find(i => i.Name === 'MpesaReceiptNumber')?.Value;
 
      await PaymentService.markHeld(orderId, receipt);
      await OrderService.markPaid(orderId);
    } else {
      await PaymentService.fail(orderId);
    }
  }
}