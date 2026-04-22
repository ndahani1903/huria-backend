import { Request, Response } from 'express';
import { MpesaService } from './mpesa.service';
import { PaymentService } from './payment.service';
import { WebhookService } from './webhook.service';
import { prisma } from '../../config/db';  // ✅ Add this import

export class PaymentController {
  static async stkPush(req: Request, res: Response) {
    try {
      const { orderId, amount, phone } = req.body;

     // ✅ Validate required fields
      if (!orderId) {
        return res.status(400).json({ error: 'Order ID is required' });
      }
      
      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Valid amount is required' });
      }

      // ✅ Get the order to get the correct amount if not provided
      let paymentAmount = amount;
      if (!paymentAmount) {
        const order = await prisma.order.findUnique({
          where: { orderId }
        });
        if (order) {
          paymentAmount = order.amount;
        } else {
          return res.status(404).json({ error: 'Order not found' });
        }
      }

      // ✅ Pass phone number as well if needed
     const payment = await PaymentService.initiatePayment(orderId, phone || '', paymentAmount);

      res.json(payment);

    } catch (error: any) {
      console.error('STK Push error:', error);
      res.status(500).json({ 
        error: 'STK push failed',
        details: error.response?.data || error.message,
     });
    }
  }

  static async callback(req: Request, res: Response) {
    try {
      await WebhookService.handleCallback(req.body);
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Callback failed' });
    }
  }

  static async release(req: Request, res: Response) {
    try {
      const { orderId, otp } = req.body;

      const result = await PaymentService.release(orderId, otp);

      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Release failed' });
    }
  }


  static async refund(req: Request, res: Response) {
    try {
      const { orderId } = req.body;

      const result = await PaymentService.refund(orderId);

      res.json(result);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Refund failed' });
    }
  }

  static async getPayment(req: Request, res: Response) {
  try {
    const { orderId } = req.params;

    const payment = await PaymentService.get(orderId as string);

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(payment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch payment' });
  }
 }
}