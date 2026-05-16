import { Response } from 'express';
import { OrderService } from './order.service';
import { AuthRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../config/db'; 

export class OrderController {
  static async create(req: AuthRequest, res: Response) {
    try {
      const { orderId, amount, pickupLat, pickupLng } = req.body;
// Option 1: Get from request
const userId = req.user!.id;
const orderData = req.body;
      const order = await OrderService.create(orderId, amount, pickupLat, pickupLng, userId, orderData);
console.log("🧾 SAVED ORDER USER ID:", order.userId);
console.log("🧾 REQUEST USER ID:", userId);
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
   const { items, pickupLat, pickupLng, deliveryAddressId } = req.body;

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
console.log("📥 Incoming checkout body:", req.body);

    const order = await OrderService.checkout(
      req.user.id,
      items,
      pickupLat,
     pickupLng,
      deliveryAddressId
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
      const driverId = req.user.driverId;
      const order = await OrderService.markDelivered(orderId, driverId);

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
 const toStringParam = (v: string | string[]) =>
  Array.isArray(v) ? v[0] : v;

const orderId = toStringParam(req.params.orderId);

 const order = await OrderService.get(orderId as string);  // ✅ Cast to string

      res.json(order);
    } catch (error) {
      res.status(500).json({ error: 'Fetch failed' });
    }
  }



static async getMyOrders(req: AuthRequest, res: Response) {
  try {
    console.log("=== getMyOrders Controller ===");
    
    if (!req.user || !req.user.id) {
      console.error("No user in request");
      return res.status(401).json([]);
    }
    
    const userId = req.user.id;
    console.log("Fetching orders for userId:", userId);
    
    const orders = await prisma.order.findMany({
      where: { userId: userId },
      include: {
        items: {
          include: { product: true }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    
    console.log(`Found ${orders.length} orders`);
    res.json(orders);
    
  } catch (error: any) {
    console.error("Error in getMyOrders:", error);
    console.error("Stack:", error.stack);
    res.status(500).json([]);
  }
}




static async assignDriver(req: AuthRequest, res: Response) {
  try {
   console.log("🎯 ========== ASSIGN DRIVER CALLED ==========");
    console.log("📝 Request body:", req.body);
    console.log("👤 User from token:", req.user);
    console.log("📦 Order ID from body:", req.body.orderId);

    const { orderId } = req.body;

    if (!orderId) {
      console.log("❌ No orderId provided");
      return res.status(400).json({ error: "Order ID is required" });
    }

   console.log("🚀 Calling OrderService.assignDriver...");
    const result = await OrderService.assignDriver(orderId);

    console.log("✅ Assign driver successful:", result);
    res.json(result);
  } catch (error: any) {
    console.error("ASSIGN ERROR:", error.message); // 👈 ADD THIS
    res.status(500).json({
      error: error.message, // 👈 RETURN REAL ERROR
    });
  }
}

static async merchantConfirmOrder(req: AuthRequest, res: Response) {
   try {
     const toStringParam = (v: string | string[]) =>
         Array.isArray(v) ? v[0] : v;

     const orderId = toStringParam(req.params.orderId);

     const merchant = await prisma.merchant.findUnique({
         where: { userId: req.user!.id }
      });

   if (!merchant) {
      return res.status(404).json({ error: "Merchant not found" });
    }

    const merchantId = merchant?.id;

    console.log("👉 PARAM orderId:", orderId);
    console.log("👉 confirm order, TOKEN merchantId:", merchantId);

    // Verify order belongs to this merchant
    const order = await prisma.order.findFirst({
      where: { 
        orderId: orderId,
        merchantId: merchant.id 
      }
    });

    if (!order) {
      return res.status(404).json({ error: "Order not found or not yours" });
    }

    console.log("👉 DB order merchantId:", order?.merchantId);

   const result = await OrderService.merchantConfirmOrder(orderId, merchantId);
      res.json(result);
    } catch (error: any) {
      console.error("Merchant confirm error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async driverArrivedPickup(req: AuthRequest, res: Response) {
    try {
      const toStringParam = (v: string | string[]) =>
  Array.isArray(v) ? v[0] : v;

      const orderId = toStringParam(req.params.orderId);
      const driverId = req.user.driverId;
      const result = await OrderService.driverArrivedPickup(orderId, driverId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async pickupOrder(req: AuthRequest, res: Response) {
    try {
      const toStringParam = (v: string | string[]) =>
  Array.isArray(v) ? v[0] : v;

      const orderId = toStringParam(req.params.orderId);
      const driverId = req.user.driverId;
      const result = await OrderService.pickupOrder(orderId, driverId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async enRouteToCustomer(req: AuthRequest, res: Response) {
    try {
      const toStringParam = (v: string | string[]) =>
  Array.isArray(v) ? v[0] : v;

      const orderId = toStringParam(req.params.orderId);
      const driverId = req.user.driverId;
      const result = await OrderService.enRouteToCustomer(orderId, driverId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async getTripStage(req: AuthRequest, res: Response) {
    try {
      const toStringParam = (v: string | string[]) =>
  Array.isArray(v) ? v[0] : v;

      const orderId = toStringParam(req.params.orderId);
      const result = await OrderService.getTripStage(orderId);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

static async tracking(req: AuthRequest, res: Response) {
  try {
    const toStringParam = (v: string | string[]) =>
  Array.isArray(v) ? v[0] : v;

   const orderId = toStringParam(req.params.orderId);

    const data = await OrderService.getTracking(orderId as string);

    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Tracking failed" });
  }
 }

static async merchantOrders(req, res) {
 const data = await OrderService.getMerchantOrders(req.user!.id);
 res.json(data);
}

static async merchantStats(req, res) {
 const data = await OrderService.getMerchantStats(req.user!.id);
 res.json(data);
}

}
