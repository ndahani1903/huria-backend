import { prisma } from '../../config/db';
import { OrderService } from "../orders/order.service";
import { io } from "../../server";
import { SMSService } from '../../services/sms.service'; 

export class PaymentService {
  static async initiatePayment(orderId: string, phone: string, amount: number) {
     // ✅ FIX: Fetch order first to get user info
     const order = await prisma.order.findUnique({
       where: { orderId },
       include: { user: true }
     });

     if (!order) {
       throw new Error('Order not found');
     }

     const existing = await prisma.payment.findUnique({
       where: { orderId },
      });

     if (existing) {
       return existing; // prevent duplicate crash
     }

    const payment = await prisma.payment.create({
      data: {
        orderId,
        amount: amount,
        status: 'pending',
      },
    });  
 
// ✅ SMS: Send payment initiation notification
    if (order?.user?.phone) {
     await SMSService.sendPaymentReceived(order.user.phone, orderId, amount);
    } 

 
  // ✅ MARK ORDER AS PAID
  await OrderService.markPaid(orderId);

  // ✅ REAL-TIME UPDATE
  io.emit("order:update", {
    orderId,
    status: "paid",
  });

  console.log("📡 Order marked as PAID:", orderId);

  return payment;
}

  static async markHeld(orderId: string, ref: string) {
    return prisma.payment.update({
      where: { orderId },
      data: {
        status: 'held',
        transactionRef: ref,
      },
    });
  }

  static async release(orderId: string, otp: string) {
    const order = await prisma.order.findUnique({
    where: { orderId },
  });

  if (!order || order.status !== 'completed') {
    throw new Error('Order not completed');
  }

  if (otp !== '123456') {
    throw new Error('Invalid OTP');
  }

  return prisma.payment.update({
    where: { orderId },
    data: { status: 'released' },
    });
  }

  static async refund(orderId: string) {
    const payment = await prisma.payment.update({
      where: { orderId },
      data: { status: 'refunded' },
    });

    await prisma.refund.create({
      data: {
        paymentId: payment.id,
        amount: payment.amount,
        status: 'pending',
      },
    });

    return payment;
  }

  static async fail(orderId: string) {
    return prisma.payment.update({
      where: { orderId },
      data: { status: 'failed' },
    });
  }

  static async get(orderId: string) {
    return prisma.payment.findUnique({
      where: { orderId },
    });
  }
}