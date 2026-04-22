import { Response } from 'express';
import { OrderService } from './order.service';
import { AuthRequest } from '../../middleware/auth.middleware';

export class OrderController {
  static async create(req: AuthRequest, res: Response) {
    try {
      const { orderId, amount, pickupLat, pickupLng } = req.body;

      const order = await OrderService.create(orderId, amount, pickupLat, pickupLng);

      res.json(order);
    } catch (error: any) {
    console.error("CREATE ORDER ERROR:", error); // 👈 IMPORTANT
    res.status(500).json({
      error: error.message, // 👈 SHOW REAL ERROR
    });
   }
  }

  static async checkout(req: AuthRequest, res: any) {
  try {
    const { items, pickupLat, pickupLng } = req.body;

   // ✅ CHECK IF USER EXISTS
      if (!req.user) {
        console.error("❌ No user found in AuthRequest!");
        return res.status(401).json({ error: "User not authenticated" });
      }

     if (!req.user.id) {
        console.error("❌ No user ID found!");
        return res.status(401).json({ error: "User ID missing" });
      }

      console.log("✅ Checkout for user:", req.user.id); // ✅ DEBUG

    const order = await OrderService.checkout(
      req.user.id,
      items,
      pickupLat,
      pickupLng
    );

    res.json(order);
  } catch (err: any) {
    console.error("❌ Checkout error:", err.message);
    res.status(400).json({ error: err.message });
  }
}

  static async deliver(req: AuthRequest, res: Response) {
    try {
      const { orderId } = req.body;

      const order = await OrderService.markDelivered(orderId);

      res.json(order);
    } catch (error) {
      res.status(500).json({ error: 'Delivery failed' });
    }
  }

  static async complete(req: AuthRequest, res: Response) {
    try {
      const { orderId, otp } = req.body;

      const order = await OrderService.complete(orderId, otp);

      res.json(order);
    } catch (error) {
      res.status(500).json({ error: 'Completion failed' });
    }
  }

  static async get(req: AuthRequest, res: Response) {
try {
 const { orderId } = req.params;

 const order = await OrderService.get(orderId as string);  // ✅ Cast to string

      res.json(order);
    } catch (error) {
      res.status(500).json({ error: 'Fetch failed' });
    }
  }

static async assignDriver(req: AuthRequest, res: Response) {
  try {
    const { orderId } = req.body;

    const result = await OrderService.assignDriver(orderId);

    res.json(result);
  } catch (error: any) {
    console.error("ASSIGN ERROR:", error.message); // 👈 ADD THIS
    res.status(500).json({
      error: error.message, // 👈 RETURN REAL ERROR
    });
  }
}

static async tracking(req: AuthRequest, res: Response) {
  try {
    const { orderId } = req.params;

    const data = await OrderService.getTracking(orderId as string);

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Tracking failed" });
  }
}
}
