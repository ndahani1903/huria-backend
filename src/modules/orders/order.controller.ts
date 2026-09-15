// src/modules/orders/order.controller.ts

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
   const { items, pickupLat, pickupLng, deliveryAddressId, promoCode } = req.body;

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
    console.log("🎟️ Promo code received:", promoCode);

    const order = await OrderService.checkout(
      req.user.id,
      items,
      pickupLat,
     pickupLng,
      deliveryAddressId,
      promoCode 
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
    
    // ✅ OPTIMIZED: Only fetch necessary fields, limit results
    const orders = await prisma.order.findMany({
      where: { userId: userId },
      select: {
        id: true,
        orderId: true,
        amount: true,
        totalAmount: true,
        finalAmount: true,
        status: true,
        tripStage: true,
        createdAt: true,
        updatedAt: true,
        completedAt: true,
        expiresAt: true,
        discountPercentage: true,
        discountAmount: true,
        deliveryFee: true,
        metadata: true,
        // ✅ Only select necessary fields from relations
        items: {
          select: {
            id: true,
            quantity: true,
            price: true,
            merchantId: true,
            product: {
              select: {
                id: true,
                name: true,
                images: true,
                merchant: {
                  select: {
                    name: true,
                    businessName: true
                  }
                }
              }
            }
          }
        },
        user: {
          select: {
            id: true,
            name: true,
            phone: true
          }
        },
        merchant: {
          select: {
            id: true,
            businessName: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      // ✅ Limit to recent orders only
      take: 50
    });
    
    console.log(`Found ${orders.length} orders`);
    res.json(orders);
    
  } catch (error: any) {
    console.error("Error in getMyOrders:", error);
    console.error("Stack:", error.stack);
    res.status(500).json([]);
  }
}




// In order.controller.ts - update assignDriver
static async assignDriver(req: AuthRequest, res: Response) {
  try {
    console.log("🎯 ========== ASSIGN DRIVER CALLED ==========");
    console.log("📦 Order ID from body:", req.body.orderId);

    const { orderId } = req.body;

    if (!orderId) {
      return res.status(400).json({ error: "Order ID is required" });
    }

    // First check if order already has a driver assigned
    const order = await prisma.order.findUnique({
      where: { orderId },
      select: { status: true, driverId: true }
    });
    
    if (order?.driverId) {
      // Order already has a driver - just notify that driver
      const { DriverAssignmentService } = await import('../../services/driverAssignment.service');
      await DriverAssignmentService.assignDriverWithTimeout(orderId, order.driverId);
      return res.json({ success: true, message: "Driver notified" });
    }

    const { DriverAssignmentService } = await import('../../services/driverAssignment.service');
    const result = await DriverAssignmentService.attemptAssignment(orderId, 0);

    console.log("✅ Assign driver result:", result);

    if (result) {
      res.json({ success: true, message: "Driver assigned successfully" });
    } else {
      res.json({ success: false, message: "No drivers available, will retry automatically" });
    }
  } catch (error: any) {
    console.error("ASSIGN ERROR:", error.message);
    res.status(500).json({ error: error.message });
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



/**
 * Admin: Mark FBU order as delivered (bypasses OTP)
 */
static async markFBUDelivered(req: AuthRequest, res: Response) {
  try {
    const { orderId } = req.body;
    
    if (!orderId) {
      return res.status(400).json({ error: 'Order ID required' });
    }
    
    const order = await prisma.order.findUnique({
      where: { orderId },
      include: { user: true }
    });
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (order.shippingMode !== 'FBU_COURIER') {
      return res.status(400).json({ error: 'This endpoint is only for FBU orders' });
    }
    
    if (order.status === 'delivered' || order.status === 'completed') {
      return res.status(400).json({ error: 'Order already delivered or completed' });
    }
    
    // Generate a dummy OTP for FBU orders (or skip OTP requirement)
    const dummyOtp = Math.floor(100000 + Math.random() * 900000).toString();
    
    const updated = await prisma.order.update({
      where: { orderId },
      data: {
        status: 'delivered',
        tripStage: 'delivered',
        otp: dummyOtp,
        deliveryArrivalTime: new Date()
      }
    });
    
    // Log admin action
    await prisma.auditLog.create({
      data: {
        adminId: req.user!.id,
        action: 'MARK_FBU_DELIVERED',
        targetType: 'order',
        targetId: orderId,
        meta: { shippingMode: order.shippingMode },
        severity: 'info'
      }
    });
    
    // Send SMS to customer
    if (order.user?.phone) {
      const { SMSService } = await import('../../services/sms.service');
      await SMSService.sendRealSMS(
        order.user.phone,
        `📦 Your FBU order ${orderId} has been delivered! Thank you for shopping with HURIA.`
      );
    }
    
    res.json({ success: true, order: updated });
    
  } catch (error: any) {
    console.error('Mark FBU delivered error:', error);
    res.status(500).json({ error: error.message });
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


static async preview(req: AuthRequest, res: Response) {
  try {
    const { items, deliveryAddressId } = req.body;

    const result = await OrderService.previewDelivery(
      req.user!.id,
      items,
      deliveryAddressId
    );

    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}
}
