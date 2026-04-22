import { prisma } from '../../config/db';
import { io } from "../../server"; // ✅ HERE
import { calculateDistance } from '../../utils/distance';
import { DriverService } from '../drivers/driver.service';
import { redis } from "../../config/redis";
import { NotificationService } from '../notifications/notification.service';
import { MapsService } from "../../services/maps.service";
import { WalletService } from "../wallet/wallet.service";
import { EscrowService } from '../../services/escrow.service';
import { SMSService } from '../../services/sms.service';
import { MerchantWalletService } from "../merchants/merchantWallet.service";

export class OrderService {
  static async create(orderId: string, amount: number, pickupLat: number, pickupLng: number) {

   const address = await MapsService.reverseGeocode(pickupLat, pickupLng);
   console.log("Resolved address:", address);

    const order = await prisma.order.create({
      data: {
        orderId,
        amount,
        status: 'pending',
        pickupLat,
        pickupLng,
        pickupAddress: address
      },
    });

// ✅ REAL-TIME EMIT HERE
  io.emit("order:new", {
    orderId: order.orderId,
    amount: order.amount,
    status: order.status,
    pickupLat: order.pickupLat,
    pickupLng: order.pickupLng,
   });

  console.log("📡 Emitting new order:", order.orderId);
  return order;
  }

  static async checkout(userId: string, items: any[], pickupLat: number, pickupLng: number) {
   console.log("📦 Checkout service called with userId:", userId);
  console.log("📦 Items:", items);

  if (!items || items.length === 0) {
    throw new Error("Cart is empty");
  }

    if (!userId) {
    throw new Error("User ID is required");
  }

  // 🧮 calculate total
  let total = 0;
  const validatedItems = [];

  for (const item of items) {
    console.log("🔍 Looking up product:", item.productId);

    const product = await prisma.product.findUnique({
      where: { id: item.productId },
    });

   if (!product) {
        throw new Error(`Product with ID ${item.productId} not found`);
      }
  
      // ✅ CHECK STOCK AVAILABILITY
      if (product.stock < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`);
      }

    total += product.price * item.quantity;

   validatedItems.push({
        productId: product.id,
        quantity: item.quantity,
        price: product.price,
      merchantId: product.merchantId,
      });
  }

   console.log("💰 Total amount:", total);

  // 🧾 create order
  const order = await prisma.order.create({
    data: {
      orderId: Date.now().toString(),
      amount: total,
      status: "pending",
       pickupLat: pickupLat || -6.832,
      pickupLng: pickupLng || 39.2,
     userId: userId,  // ✅ This is correct
    },
  });

   console.log("✅ Order created with ID:", order.id);
  console.log("✅ Order orderId:", order.orderId);

   // ✅ SMS: Send order creation notification
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (user?.phone) {
      await SMSService.sendOrderCreated(user.phone, order.orderId);
    }

  // 📦 create order items
  for (const item of validatedItems) {
    const product = await prisma.product.findUnique({
        where: { id: item.productId },
      });

  if (product) {
    await prisma.orderItem.create({
      data: {
        orderId: order.id, // ⚠️ internal ID
       productId: product.id,
          quantity: item.quantity,
          price: product.price,
          merchantId: product.merchantId,
      },
    });

   // ✅ UPDATE STOCK (DECREMENT)
      await prisma.product.update({
        where: { id: product.id },
        data: {
          stock: {
            decrement: item.quantity
          }
        }
      });
  }
}

   // ✅ STEP 4: SEND NOTIFICATIONS
    await NotificationService.sendOrderUpdate(
      userId, 
      `Order ${order.orderId} created successfully`
    );

  io.emit("order:new", {
    orderId: order.orderId,
    amount: order.amount,
    status: order.status,
    pickupLat: order.pickupLat,
    pickupLng: order.pickupLng,
  });

 console.log("📡 Emitted new order:", order.orderId);

  return order;
}

static async markPaid(orderId: string) {
    // ✅ Send notification to customer
    const order = await prisma.order.findUnique({
      where: { orderId },
      include: { user: true }
    });

   if (!order) throw new Error('Order not found');

   // Hold payment in escrow
  await EscrowService.holdPayment(orderId, order.amount, order.userId);

    const updated = await prisma.order.update({
      where: { orderId },
      data: { status: 'paid' },
    });

// ✅ SMS: Send payment received notification
    if (order.user?.phone) {
      await SMSService.sendPaymentReceived(order.user.phone, orderId, order.amount);
    }

io.emit("order:update", {
  orderId,
  status: "paid",
  });
    
    if (order?.user?.phone) {
      await NotificationService.sendSMS(
        order.user.phone,
        `Payment received for order ${orderId}. Your driver will be assigned shortly.`
      );
    }

   // ✅ ADD DELAY or ensure order is committed
  //setTimeout(async () => {
     //await this.assignDriver(orderId);  // ADD THIS LINE (AUTO DISPATCH)
     //}, 1000); // Small delay for DB commit

    return updated;
  }

  static generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

 static async markDelivered(orderId: string) {
    const otp = this.generateOTP();
  console.log(`🎫 OTP for order ${orderId}: ${otp}`); //Log OTP 4 testing
   
 const updated = await prisma.order.update({
      where: { orderId },
      data: {
        status: "delivered",
        otp,
      },
    });

  io.emit("order:update", {
    orderId,
    status: "delivered",
  });


   // Send OTP to customer
  const order = await prisma.order.findUnique({
    where: { orderId },
    include: { user: true }
  });
    
 if (order?.user?.phone) {
   await NotificationService.sendSMS(
    order.user.phone,
   `Your order ${orderId} has been delivered. OTP for completion: ${otp}`
      );
      await SMSService.sendOrderDelivered(order.user.phone, orderId, otp);
    }

    return updated;
  }

 static async complete(orderId: string, otp: string) {
   try {
    console.log(`🔍 Completing order ${orderId} with OTP: ${otp}`);
    
    // ✅ FIX: Include driver with user relation properly
    const order = await prisma.order.findUnique({
      where: { orderId },
     include: { 
        driver: { 
          include: { user: true } 
        }, 
       user: true 
      }
    });

if (!order) {
  throw new Error('Order not found');
}

  console.log(`📦 Order found - Status: ${order.status}, OTP in DB: ${order.otp}`);

 // Verify OTP (only if status is delivered)
    if (order.status === 'delivered') {
      if (order.otp !== otp) {
        throw new Error('Invalid OTP');
      }
    }

// Check if already completed
  if (order.status === 'completed') {
    throw new Error('Order already completed');
  }

 
    // ✅ RELEASE PAYMENT FROM ESCROW
 try {
      await EscrowService.releasePayment(orderId);
      console.log(`💰 Payment released from escrow for order ${orderId}`);
    } catch (escrowError) {
      console.error("Escrow release error:", escrowError);
      // Continue anyway
    }

   // ✅ UPDATE ORDER STATUS TO COMPLETED
    const updated = await prisma.order.update({
      where: { orderId },
      data: { status: 'completed' },
    });

    console.log(`✅ Order ${orderId} status updated to completed`);

// 💰 CREDIT DRIVER
if (updated.driverId) {
  const driverAmount = updated.amount * 0.8; // 80% to driver
  try {
        await WalletService.credit(updated.driverId, driverAmount);
        console.log(`💰 Credited driver ${updated.driverId} with ${driverAmount} TZS`);


// ✅ SMS: Notify driver about earnings via SMS if phone exists
      const driverUser = order.driver?.user;
      if (driverUser?.phone) {
        await SMSService.sendDriverEarnings(driverUser.phone, driverAmount, orderId);
     await NotificationService.sendSMS(
          driverUser.phone,
          `Order ${orderId} completed! ${driverAmount} TZS added to your wallet.` );
      }
    }  catch (creditError) {
        console.error("Driver credit error:", creditError);
      }
    }

 // 🔥 FREE DRIVER
  if (updated.driverId) {
      try {
        await DriverService.markAvailable(updated.driverId);
        console.log(`🚚 Driver ${updated.driverId} marked as available`);
      } catch (driverError) {
        console.error("Driver availability error:", driverError);
      }
  }

    // 💰 RELEASE PAYMENT TO MERCHANT
  // Get all order items to credit merchants
   try {
      const orderItems = await prisma.orderItem.findMany({
        where: { orderId: order.id },
        include: { product: true }
      });
  
  // Group by merchant
  const merchantPayments = new Map();
  for (const item of orderItems) {
    const merchantId = item.merchantId;
    const amount = item.price * item.quantity;
    if (merchantPayments.has(merchantId)) {
      merchantPayments.set(merchantId, (merchantPayments.get(merchantId) || 0) + amount);
    } else {
      merchantPayments.set(merchantId, amount);
    }
  }
  
// Credit merchants (u need a MerchantWallet table/add to merchant model)
  for (const [merchantId, amount] of merchantPayments) {
    console.log(`💰 Merchant ${merchantId} gets ${amount} TZS`);
     await MerchantWalletService.credit(merchantId, amount);
  }
 } catch (merchantError) {
      console.error("Merchant credit error:", merchantError);
    }

    // ✅ EMIT REAL-TIME UPDATE
io.emit("order:update", {
    orderId,
    status: "completed",
  });

console.log("📡 Order completed:", orderId);
  return updated;
  } catch (error: any) {
    console.error("❌ Complete order error:", error.message);
    console.error("Stack:", error.stack);
    throw error; // Re-throw to be caught by controller
  }
}

  static async get(orderId: string) {
    return prisma.order.findUnique({
      where: { orderId },
     include: {
        items: {
          include: { product: true }
        }
      }
    });
  }

static async assignDriver(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { orderId },
  });

  if (order.status !== "paid") {
     throw new Error("Order not paid yet");
   }

  if (!order || !order.pickupLat || !order.pickupLng) {
    throw new Error('Order location missing');
  }

/*
  //const allDrivers = await prisma.driver.findMany();
//console.log("ALL DRIVERS:", allDrivers);

//const drivers = await DriverService.getAvailable();
//console.log("AVAILABLE DRIVERS:", drivers);

const drivers = await prisma.driver.findMany();
//hii find many inakuwa sio smart dispatch yenyewe dereva yyote anapewa oda
//hata kama yupo busy, so hii itakuwa alternative endapo smart ikifeli
*/

 // Get available drivers from Redis
const driverIds = await redis.sMembers("drivers:available");
console.log("🔍 Available drivers in Redis:", driverIds);

const drivers = await prisma.driver.findMany({
  where: {
    id: { in: driverIds },
  },
});
 
 console.log("ALL DRIVERS:", drivers);

  if (!drivers.length || !driverIds.length) {
    throw new Error('No drivers available');
  }

//find the best driver based on distance
  let bestDriver = null;
  let bestScore = Infinity;

  for (const driver of drivers) {
    const key = `driver:${driver.id}:location`;
    const locationRaw = await redis.get(key);

    console.log("Checking:", key, locationRaw);

    if (!locationRaw) {
      console.log(`Driver ${driver.id} has no location data`);
      continue; // Skip drivers without location
     }

   let location;

   try {
     location = JSON.parse(locationRaw);
   } catch {
       console.log("Invalid location JSON:", locationRaw);
       continue;
    }

    const distance = calculateDistance(
      order.pickupLat,
      order.pickupLng,
      location.lat,
      location.lng
    );

// score = distance (lower is better)
  if (distance < bestScore) {
    bestScore = distance;
    bestDriver = driver;
   }
  } 
 
 //check if we found a driver with location
  if (!bestDriver) {
      throw new Error('No drivers with location data');
     }
  console.log("BEST DRIVER:", bestDriver.id, "Distance:", bestScore);

/*
// Store in memory or database
  driverLocations.set(driverId, { lat, lng, timestamp: Date.now() });
  
  // Broadcast to customers
  socket.broadcast.emit("driver:location", { driverId, lat, lng });
}); */

// 📏 CALCULATE DISTANCE
const distance = bestScore; // already calculated
// 💰 PRICING LOGIC
const baseFare = 1000; // TZS
const perKm = 500;
const deliveryFee = baseFare + (distance * perKm);
// 💸 SPLIT
const platformFee = deliveryFee * 0.2; // 20%
const driverEarning = deliveryFee * 0.8;

  // Mark driver as busy
  await DriverService.markBusy(bestDriver.id);

//update order with driver and pricing
const updatedOrder = await prisma.order.update({
    where: { orderId },
    data: {
      driverId: bestDriver.id,
      status: 'assigned',
      distance,
     deliveryFee,
     driverEarning,
     platformFee,
    },
  });


 // 🎯 SEND ONLY TO BEST DRIVER
io.to(bestDriver.id).emit("order:new", {
  orderId: updatedOrder.orderId,
  amount: updatedOrder.amount,
  status: updatedOrder.status,
  pickupLat: updatedOrder.pickupLat,
  pickupLng: updatedOrder.pickupLng,
});

console.log("📡 Sent order to driver:", bestDriver.id); 

// 🌍 BROADCAST TO EVERYONE (CUSTOMER SIDE)
io.emit("order:update", {
  orderId,
  status: "assigned",
});
  
   // Notify customer
    const customer = await prisma.user.findUnique({
      where: { id: order.userId }
    });
    
    if (customer?.phone) {
      await NotificationService.sendSMS(
        customer.phone,
        `Driver assigned to your order ${orderId}. Tracking available in app.`
      );
    }

    console.log("📡 Sent order to driver:", bestDriver.id);
  return updatedOrder;
}


static async getTracking(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { orderId }
  });

  if (!order || !order.driverId) return null;

  const key = `driver:${order.driverId}:location`;
  const location = await redis.get(key);

  return {
    orderId,
    driverId: order.driverId,
    location: location ? JSON.parse(location) : null
  };
 }
}
