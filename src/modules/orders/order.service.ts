import { prisma } from '../../config/db';
import { io } from "../../server"; 
import { calculateDistance } from '../../utils/distance';
import { DriverService } from '../drivers/driver.service';
import { redis } from "../../config/redis";
import { NotificationService } from '../notifications/notification.service';
import { MapsService } from "../../services/maps.service";
import { WalletService } from "../wallet/wallet.service";
import { EscrowService } from '../../services/escrow.service';
import { SMSService } from '../../services/sms.service';
import { MerchantWalletService } from "../merchants/merchantWallet.service";
import merchantTierService from '../merchants/tiers.service';
import subscriptionService from '../subscription/subscription.service';
import { SUBSCRIPTION_TIERS } from '../subscription/subscription.service';
import { Decimal } from "@prisma/client/runtime/library";

export const toNumber = (val: any): number => {
  if (!val) return 0;
  if (val instanceof Decimal) return val.toNumber();
  return Number(val);
};

export class OrderService {
  static async create(orderId: string, amount: number, pickupLat: number, pickupLng: number, userId: string, orderData: any) {
   // Apply subscription benefits
  const orderWithBenefits = await subscriptionService.applySubscriptionBenefits(orderData, userId);

  const merchantId = orderData.merchantId;

const merchant = await prisma.merchant.findUnique({
  where: { id: merchantId }
});

if (!merchant) {
  throw new Error("Merchant not found");
}

   const address = await MapsService.reverseGeocode(merchant.pickupLat, merchant.pickupLng);
   console.log("Resolved address:", address);

    const order = await prisma.order.create({
      data: {
        ...orderData,
        deliveryFee: orderWithBenefits.deliveryFee,
        discountPercentage: orderWithBenefits.discountPercentage,
        discountAmount: orderWithBenefits.discountAmount,
        finalAmount: orderWithBenefits.finalAmount,
        orderId,
        userId: userId, 
        amount,
        status: 'pending',
       tripStage: 'pending',
        pickupLat: merchant.pickupLat,
        pickupLng: merchant.pickupLng,
        pickupAddress: address
      },
    });

   
    


// ✅ REAL-TIME EMIT HERE
  io.emit("order:new", {
    orderId: order.orderId,
    userId: order.userId, 
    amount: order.amount,
    status: order.status,
   tripStage: order.tripStage,
    pickupLat: order.pickupLat,
    pickupLng: order.pickupLng,
   });

  console.log("📡 Emitting new order:", order.orderId);
console.log("🧾 SAVED ORDER USER ID:", order.userId);
console.log("🧾 REQUEST USER ID:", userId);
  return order;
  }

  static async checkout(
     userId: string, 
     items: any[], 
     pickupLat: number, 
     pickupLng: number,
     deliveryAddressId?: string,
     customDelivery?: { lat: number; lng: number; address: string }
) {
  console.log("📦 Checkout service called with userId:", userId);
  console.log("📦 Items:", items);
  console.log("📍 deliveryAddressId:", deliveryAddressId);

  if (!items || items.length === 0) {
    throw new Error("Cart is empty");
  }

  if (!userId) {
    throw new Error("User ID is required");
  }


  // Get or create delivery location
    let deliveryLat: number, 
        deliveryLng: number, 
        deliveryAddress: string;
    
    if (customDelivery) {
      deliveryLat = customDelivery.lat;
      deliveryLng = customDelivery.lng;
      deliveryAddress = customDelivery.address;
    } else if (deliveryAddressId) {
      const address = await prisma.address.findUnique({ where: { id: deliveryAddressId } });
      if (!address) throw new Error("Address not found");
      deliveryLat = address.lat;
      deliveryLng = address.lng;
      deliveryAddress = address.address;
    } else {
       // Get user's default address
      const defaultAddress = await prisma.address.findFirst({
        where: { userId, isDefault: true }
      });
      if (!defaultAddress) throw new Error("Please add a delivery address");
      deliveryLat = defaultAddress.lat;
      deliveryLng = defaultAddress.lng;
      deliveryAddress = defaultAddress.address;
    }

  // ✅ STEP 1: GET USER'S SUBSCRIPTION BENEFITS
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: 'active',
      startDate: { lte: new Date() },
      endDate: { gte: new Date() }
    }
  });
  
  let discountPercentage = 0;
  let freeDelivery = false;
  
  if (subscription) {
    const tierInfo = SUBSCRIPTION_TIERS[subscription.tier];
    if (tierInfo) {
      discountPercentage = tierInfo.benefits.discountPercentage;
      freeDelivery = tierInfo.benefits.freeDelivery;
      console.log(`✅ User has ${subscription.tier} subscription - ${discountPercentage}% discount`);
    }
  }
   
    // ✅ STEP 2: CHECK FOR WELCOME DISCOUNT
  const welcomePromo = await prisma.userPromotion.findFirst({
    where: { userId, type: 'welcome_discount', used: false, expiresAt: { gte: new Date() } }
  });
  
  if (welcomePromo && welcomePromo.value > discountPercentage) {
    discountPercentage = welcomePromo.value;
    console.log(`✅ Welcome discount applied: ${discountPercentage}%`);
  }

  // ✅ STEP 3: CHECK FOR OTHER PROMOTIONS
  const activePromo = await prisma.userPromotion.findFirst({
    where: { userId, type: { in: ['referral', 'seasonal'] }, used: false, expiresAt: { gte: new Date() } },
    orderBy: { value: 'desc' }
  });
  
  if (activePromo && activePromo.value > discountPercentage) {
    discountPercentage = activePromo.value;
    console.log(`✅ Promo discount applied: ${discountPercentage}%`);
  }


  // 🧮 STEP 4: PROCESS ITEMS AND CALCULATE TOTALS
  let subtotal = 0;
  let totalDiscount = 0;
  const validatedItems = [];

  for (const item of items) {
    console.log("🔍 Looking up product:", item.productId);

    const product = await prisma.product.findUnique({
      where: { id: item.productId },
    });

    if (!product) {
      throw new Error(`Product with ID ${item.productId} not found`);
    }

    if (product.stock < item.quantity) {
      throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`);
    }

    const itemTotal = toNumber(product.price) * item.quantity;
    const itemDiscount = itemTotal * (discountPercentage / 100);
    subtotal += itemTotal;
    totalDiscount += itemDiscount;

    validatedItems.push({
      productId: product.id,
      quantity: item.quantity,
      originalPrice: product.price,
      discountedPrice: toNumber(product.price) * (1 - discountPercentage / 100),
      merchantId: product.merchantId,
    });
  }

  const finalAmount = subtotal - totalDiscount;
  console.log(`💰 Subtotal: ${subtotal}, Discount: ${totalDiscount} (${discountPercentage}%), Final: ${finalAmount}`);

  // ✅ STEP 5: CALCULATE DELIVERY FEE
  let deliveryFee = 2000;
  if (freeDelivery) {
    deliveryFee = 0;
    console.log(`🚚 Free delivery applied`);
  }


  // Calculate delivery fee based on distance if delivery provided
    if (deliveryLat && deliveryLng && pickupLat && pickupLng) {
      const distance = calculateDistance(pickupLat, pickupLng, deliveryLat, deliveryLng);
      deliveryFee = Math.max(2000, Math.min(10000, distance * 1000));
      if (freeDelivery) deliveryFee = 0;
    }


  // ✅ STEP 6: GET MERCHANT COMMISSION RATES
  const merchantIds = [...new Set(validatedItems.map(item => item.merchantId))];
  const merchants = await prisma.merchant.findMany({
    where: { id: { in: merchantIds } },
    select: { id: true, commissionRate: true, tier: true }
  });
  
  const commissionMap = new Map();
  merchants.forEach(m => commissionMap.set(m.id, m.commissionRate));
  
  // Calculate platform fees
  let totalPlatformFee = 0;
  for (const item of validatedItems) {
    const merchantCommission = commissionMap.get(item.merchantId) || 0.05;
    const itemRevenue = item.discountedPrice * item.quantity;
    const platformFee = itemRevenue * merchantCommission;
    totalPlatformFee += platformFee;
  }
  
  const driverEarning = deliveryFee * 0.8;
  const platformProfit = totalPlatformFee + (deliveryFee * 0.2);
  const orderId = `ORD-${Date.now()}`;
  const amount = finalAmount + deliveryFee;
 if (!validatedItems.length) throw new Error("No valid items");
  const merchantId = validatedItems[0].merchantId;
const pickupAddress = await MapsService.reverseGeocode(pickupLat, pickupLng);

  // 🧾 CREATE ORDER
const result = await prisma.$transaction(async (tx) => {

const order = await tx.order.create({
  data: {
    orderId,
    amount,
    userId,
    merchantId,
    status: 'pending',
    tripStage: 'pending',
    pickupLat,
    pickupLng,
    pickupAddress,
    deliveryLat,
    deliveryLng,
    deliveryAddress,
   deliveryAddressId: deliveryAddressId,
    deliveryFee,
    discountPercentage,
    discountAmount: totalDiscount,
    finalAmount
  },
});

  console.log("✅ Order created with ID:", order.id);

   await Promise.all(
    validatedItems.map(async (item) => {

      const updated = await tx.product.updateMany({
        where: {
          id: item.productId,
          stock: { gte: item.quantity }
        },
        data: {
          stock: { decrement: item.quantity }
        }
      });

      if (updated.count === 0) {
        throw new Error("Stock no longer available");
      }


  // 📦 CREATE ORDER ITEMS
      await tx.orderItem.create({
        data: {
         orderId: order.id,
         productId: item.productId,
         quantity: item.quantity,
         price: item.discountedPrice,
         merchantId: item.merchantId
      }
      });
    })
  );

   
  // Mark promos as used
  if (welcomePromo && discountPercentage === welcomePromo.value) {
    await tx.userPromotion.update({
       where: { id: welcomePromo.id }, 
       data: { used: true } 
     });
    }

  if (activePromo && discountPercentage === activePromo.value) {
    await tx.userPromotion.update({
        where: { id: activePromo.id },
        data: { used: true }
      });
     }

  // ✅ SMS: Send order creation notification
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user?.phone) {
    await SMSService.sendOrderCreated(user.phone, order.orderId);
  }
  // ✅ SEND NOTIFICATIONS
  await NotificationService.notifyOrderCreated(userId, `Order ${order.orderId} created successfully`);

  // ✅ EMIT REAL-TIME EVENT
  io.emit("order:new", {
    orderId: order.orderId,
    amount: order.amount,
    status: order.status,
    tripStage: order.tripStage,
    pickupLat: order.pickupLat,
    pickupLng: order.pickupLng,
    deliveryLat: order.deliveryLat,
    deliveryLng: order.deliveryLng,
    finalAmount: order.finalAmount,
    discountAmount: order.discountAmount,
    discountPercentage: order.discountPercentage,
    deliveryFee: order.deliveryFee,
  });

  console.log("📡 Emitted new order:", order.orderId);

  return order;
});

console.log("✅ Checkout completed, order returned:", result.orderId);
return result;
}

static async markPaid(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { orderId },
      include: { user: true }
    });

   if (!order) throw new Error('Order not found');

   // Hold payment in escrow
  await EscrowService.holdPayment(orderId, toNumber(order.amount), order.userId);

    const updated = await prisma.order.update({
      where: { orderId },
      data: { status: 'paid' },
    });

// ✅ SMS: Send payment received notification
    if (order.user?.phone) {
      await SMSService.sendPaymentReceived(order.user.phone, orderId, toNumber(order.amount));
    }

   io.emit("order:update", { orderId, status: "paid" });

    return updated;
  }

  static generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }


// Merchant confirms order is ready
  static async merchantConfirmOrder(orderId: string, merchantId: string) {
    const order = await prisma.order.findUnique({ where: { orderId } });
    if (!order) throw new Error("Order not found");
    if (order.merchantId !== merchantId) throw new Error("Unauthorized");

    const updated = await prisma.order.update({
      where: { orderId },
      data: { 
        merchantConfirmed: true,
        readyForPickup: true,
        tripStage: 'ready_for_pickup'
      }
    });

    io.emit("order:update", { orderId, status: order.status, tripStage: 'ready_for_pickup' });
    
    // Notify drivers that order is ready
    io.emit("order:ready", { orderId, pickupLat: order.pickupLat, pickupLng: order.pickupLng });
    
    return updated;
  }


   // Driver arrives at pickup
  static async driverArrivedPickup(orderId: string, driverId: string) {
    const order = await prisma.order.findUnique({ where: { orderId } });
    if (!order) throw new Error("Order not found");
    if (order.driverId !== driverId) throw new Error("Unauthorized");
   // if (order.tripStage !== 'assigned') throw new Error("Invalid state transition");

    const updated = await prisma.order.update({
      where: { orderId },
      data: { 
        tripStage: 'arrived_pickup',
        pickupArrivalTime: new Date()
      }
    });

    io.emit("order:update", { orderId, tripStage: 'arrived_pickup' });
    
    // Notify merchant driver has arrived
    io.to(`merchant:${order.merchantId}`).emit("driver:arrived", { orderId, driverId });
    
    return updated;
  }


   // Driver picks up order
  static async pickupOrder(orderId: string, driverId: string) {
    const order = await prisma.order.findUnique({ where: { orderId } });
    if (!order) throw new Error("Order not found");
    if (order.driverId !== driverId) throw new Error("Unauthorized");
   // if (order.tripStage !== 'arrived_pickup') throw new Error("Invalid state transition");

    const updated = await prisma.order.update({
      where: { orderId },
      data: { 
        tripStage: 'picked_up',
        pickupTime: new Date()
      }
    });

    io.emit("order:update", { orderId, tripStage: 'picked_up' });
    
    // Calculate and cache route to delivery point
    await this.cacheRouteToDelivery(orderId);
    
    return updated;
  }


   // Driver en route to customer
  static async enRouteToCustomer(orderId: string, driverId: string) {
    const order = await prisma.order.findUnique({ where: { orderId } });
    if (!order) throw new Error("Order not found");
    if (order.driverId !== driverId) throw new Error("Unauthorized");
   // if (order.tripStage !== 'picked_up') throw new Error("Invalid state transition");

    const updated = await prisma.order.update({
      where: { orderId },
      data: { tripStage: 'en_route' }
    });

    io.emit("order:update", { orderId, tripStage: 'en_route' });
    
    return updated;
  }


 static async markDelivered(orderId: string, driverId: string) {
    const order = await prisma.order.findUnique({ 
       where: { orderId },
      include: { user: true }
   });
    if (!order) throw new Error("Order not found");
    if (order.driverId !== driverId) throw new Error("Unauthorized");
  //  if (order.tripStage !== 'en_route') throw new Error("Invalid state transition");

    const otp = this.generateOTP();
  console.log(`🎫 OTP for order ${orderId}: ${otp}`); //Log OTP 4 testing
   
 const updated = await prisma.order.update({
      where: { orderId },
      data: {
        status: "delivered",
        tripStage: 'delivered',
        otp,
        deliveryArrivalTime: new Date()
      },
    });

  io.to(`user:${order.userId}`).emit("order:update", {
    orderId,
    status: "delivered",
    tripStage: 'delivered',
  });

 io.to(`driver:${driverId}`).emit("order:update", {
    orderId,
    status: "delivered",
    tripStage: 'delivered',
  });

    //send otp to customer
 if (order?.user?.phone) {
  // await NotificationService.sendSMS(
  //  order.user.phone,
  // `Your order ${orderId} has been delivered. OTP for completion: ${otp}`
 //     );
      await SMSService.sendOrderDelivered(order.user.phone, orderId, otp);
    }

    return updated;
  }


  static async getDriverCurrentOrder(driverId:string){
 return prisma.order.findFirst({
   where:{
     driverId,
     status:{ in:["assigned","delivered","paid"] }
   }
 });
}

    // Cache route to dropoff for map display
  private static async cacheRouteToDelivery(orderId: string) {
    const order = await prisma.order.findUnique({ where: { orderId } });
    if (!order || !order.pickupLat || !order.pickupLng || !order.deliveryLat || !order.deliveryLng) return;
    
    // Get route from Mapbox or Google Maps
    const route = await MapsService.getRoute(
      { lat: order.pickupLat, lng: order.pickupLng },
      { lat: order.deliveryLat, lng: order.deliveryLng }
    );
    
   if (route) {
    await prisma.order.update({
      where: { orderId },
      data: { routeGeometry: route }
    });
   }
  }


static async refreshActiveRoute(driverId: string, lat: number, lng: number) {

  const order = await prisma.order.findFirst({
    where: {
      driverId,
      status: { in: ["assigned", "delivered"] }
    }
  });

  if (!order) return;

  let destination;

  if (
    order.tripStage === "assigned" ||
    order.tripStage === "arrived_pickup" ||
    order.tripStage === "ready_for_pickup"
  ) {
    destination = {
      lat: order.pickupLat,
      lng: order.pickupLng
    };
  } else {
    destination = {
      lat: order.deliveryLat,
      lng: order.deliveryLng
    };
  }

  const route = await MapsService.getRoute(
    { lat, lng },
    destination
  );

  await prisma.order.update({
    where: { orderId: order.orderId },
    data: { routeGeometry: route }
  });
}

   // Get trip stage for map routing
  static async getTripStage(orderId: string) {
    const order = await prisma.order.findUnique({ where: { orderId } });
    if (!order) return null;
    
    // Determine map target based on trip stage
    let mapTarget = null;
    let showRoute = false;
    
    if (order.tripStage === 'assigned' || order.tripStage === 'arrived_pickup' || order.tripStage === 'ready_for_pickup') {
      // Show route from driver → pickup
      mapTarget = { lat: order.pickupLat, lng: order.pickupLng, type: 'pickup' };
      showRoute = true;
    } else if (order.tripStage === 'picked_up' || order.tripStage === 'en_route' || order.tripStage === 'delivered') {
     if (order.deliveryLat && order.deliveryLng) {
      // Show route from driver → delivery_address
      mapTarget = { lat: order.deliveryLat, lng: order.deliveryLng, type: 'delivered' };
      showRoute = true;
    }
  }
   
    return {
      tripStage: order.tripStage,
      mapTarget,
      showRoute,
      routeGeometry: order.routeGeometry
    };
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
    await EscrowService.releasePayment(orderId);
 console.log(`💰 Payment released from escrow for order ${orderId}`);
    

   // ✅ UPDATE ORDER STATUS TO COMPLETED
    const updated = await prisma.order.update({
      where: { orderId },
      data: { status: 'completed', tripStage: 'completed' },
    });

    console.log(`✅ Order ${orderId} status updated to completed`);

  if (updated.merchantId) {
  await merchantTierService.evaluateAndUpgrade(updated.merchantId);
}

// 💰 CREDIT DRIVER
if (updated.driverId) {
  const driverAmount = updated.driverEarning || (toNumber(updated.deliveryFee) * 0.8); // 80% to driver
  try {
  await WalletService.credit(updated.driverId, Number(driverAmount));
 console.log(`💰 Credited driver ${updated.driverId} with ${driverAmount} TZS`);


// ✅ SMS: Notify driver about earnings via SMS if phone exists
      const driverUser = order.driver?.user;
      if (driverUser?.phone) {
        await SMSService.sendDriverEarnings(driverUser.phone, Number(driverAmount), orderId);
     //await NotificationService.sendSMS(
        //  driverUser.phone,
       //   `Order ${orderId} completed! ${driverAmount} TZS added to your //wallet.` );
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
      }  catch (driverError) {
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
    const amount = toNumber(item.price) * item.quantity;
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

   const userId = updated.userId;
const merchantId = updated.merchantId;

    // ✅ EMIT REAL-TIME UPDATE
io.to(`user:${userId}`).emit("order:update", {orderId, status: "completed", tripStage: "completed"
  });
io.to(`merchant:${merchantId}`).emit("order:update", {orderId, status: "completed", tripStage: "completed"
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
        user: {   // ✅ ADD THIS
        select: {
          phone: true,
          name: true
        }
      },
        items: {
          include: { product: true }
        }
      }
    });
  }


static async assignDriver(orderId: string) {
 try {
  const order = await prisma.order.findUnique({
    where: { orderId } });
  if (!order) throw new Error("Order not found");
  if (order.status !== "paid") throw new Error("Order not paid yet");
  if (!order || !order.pickupLat || !order.pickupLng) 
    throw new Error('Order location missing');
  

/*
  //const allDrivers = await prisma.driver.findMany();
//console.log("ALL DRIVERS:", allDrivers);

//const drivers = await DriverService.getAvailable();
//console.log("AVAILABLE DRIVERS:", drivers);

const drivers = await prisma.driver.findMany();
//hii find many inakuwa sio smart dispatch yenyewe dereva yyote anapewa oda
//hata kama yupo busy, so hii itakuwa alternative endapo smart ikifeli
*/

 // Get available drivers from Redis (convert Buffer to string):
 const driverIdsRaw = await redis.sMembers("drivers:available");

  //Convert Set to array if needed, and ensure strings
   let driverIds: string[];
   if (driverIdsRaw instanceof Set) {
    driverIds = Array.from(driverIdsRaw).map(id => id.toString());
  } else if (Array.isArray(driverIdsRaw)) {
    driverIds = driverIdsRaw.map(id => id.toString());
  } else {
    driverIds = [];
  } 
   console.log("🔍 Available drivers in Redis:", driverIds);

   const drivers = await prisma.driver.findMany({
     where: {
        id: { in: driverIds } } });

   console.log("ALL DRIVERS:", drivers);

   if (!drivers.length || !driverIds.length)
      throw new Error('No drivers available');

   //find the best driver based on distance
     let bestDriver = null;
     let bestScore = Infinity;

     for (const driver of drivers) {
       const key = `driver:${driver.id}:location`;
       let location = null;
       const locationRaw = await redis.get(key);
       console.log("Checking:", key, locationRaw);

      if (locationRaw) {
          const locationStr = locationRaw.toString();
          location = JSON.parse(locationStr);  //Convert to string 
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
   }

   //check if we found a driver with location
    if (!bestDriver) throw new Error('No drivers with location data');
     
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
const deliveryFee = order.deliveryFee;
// 💸 SPLIT
const platformFee = toNumber(deliveryFee) * 0.2; // 20%
const driverEarning = toNumber(deliveryFee) * 0.8;

  // Mark driver as busy
  await DriverService.markBusy(bestDriver.id);


const updatedOrder = await prisma.$transaction(async (tx) => {
  const freshDriver = await tx.driver.findUnique({
    where: { id: bestDriver.id },
    select: { id: true, isBusy: true }
  });

  if (!freshDriver) {
    throw new Error("Driver not found");
  }

  if (freshDriver.isBusy) {
    throw new Error("Driver already taken");
  }

  await tx.driver.update({
    where: { id: bestDriver.id },
    data: { isBusy: true }
  });

//update order with driver and pricing
const updated = await tx.order.update({
    where: { orderId },
    data: {
      driverId: bestDriver.id,
      status: 'assigned',
      tripStage: 'assigned',
      distance,
     deliveryFee,
     driverEarning,
     platformFee,
    },
  });


 // 🎯 SEND ONLY TO BEST DRIVER
io.to(bestDriver.id).emit("order:new", {
  orderId: updated.orderId,
  amount: updated.amount,
  status: updated.status, 
  tripStage: updated.tripStage,
  pickupLat: updated.pickupLat,
  pickupLng: updated.pickupLng,
 deliveryLat: updated.deliveryLat,
 deliveryLng: updated.deliveryLng,
});

console.log("📡 Sent order to driver:", bestDriver.id); 

// 🌍 BROADCAST TO EVERYONE (CUSTOMER SIDE)
io.emit("order:update", {orderId, status: "assigned", tripStage: "assigned"
});
  
   // Notify customer
    const customer = await prisma.user.findUnique({
      where: { id: order.userId }
    });
    
   const driver = await prisma.driver.findUnique({
  where: { id: updated.driverId },
  include: {
    user: true
  }
});

if (!driver || !driver.user) {
  throw new Error("Driver not found");
}

    if (customer?.phone) {
      //await NotificationService.notifyDriverAssigned(
       // customer.phone,
     //   `Driver assigned to your order ${orderId}. Tracking available in //app.`
      //);
await SMSService.sendDriverAssigned(
  customer.phone,
  order.id,
  driver.user.name,
  driver.user.phone
);
    }

    console.log("📡 Sent order to driver:", bestDriver.id);

  return  updated;
 });
} catch (error: any) {
    console.error("Assign driver error:", error.message);
    throw error;
  }
}

static async getTracking(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { orderId },
   include: { driver: { include: { user: true } } }
  });

  if (!order || !order.driverId) return null;

  const key = `driver:${order.driverId}:location`;
  const location = await redis.get(key);
  const tripInfo = await this.getTripStage(orderId);

  return {
    orderId,
    driverId: order.driverId,
    driverName: order.driver?.user?.name,
    driverRating: order.driver?.rating,
    location: location ? JSON.parse(location.toString()) : null,
   tripStage: order.tripStage,
    mapTarget: tripInfo?.mapTarget,
   showRoute: tripInfo?.showRoute,
   routeGeometry: order.routeGeometry,
   pickupLocation: { lat: order.pickupLat, lng: order.pickupLng, address: order.pickupAddress },
  deliveryLocation: order.deliveryLat ? { lat: order.deliveryLat, lng: order.deliveryLng, address: order.deliveryAddress } : null
  };
 }

static async getMerchantOrders(userId: string) {
  const merchant = await prisma.merchant.findUnique({
    where: { userId }
  });

  if (!merchant) throw new Error("Merchant not found");

  return prisma.order.findMany({
    where: {
      merchantId: merchant.id
    },
    include: {
      user: {
        select: {
          name: true,
          phone: true
        }
      },
      items: {
        include: {
          product: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });
}

static async getMerchantStats(userId: string) {
  const merchant = await prisma.merchant.findUnique({
    where: { userId }
  });

  if (!merchant) throw new Error("Merchant not found");

  const totalProducts = await prisma.product.count({
    where: { merchantId: merchant.id }
  });

  const activeProducts = await prisma.product.count({
    where: {
      merchantId: merchant.id,
      isActive: true
    }
  });

  const totalOrders = await prisma.order.count({
    where: { merchantId: merchant.id }
  });

  const pendingOrders = await prisma.order.count({
    where: {
      merchantId: merchant.id,
      status: "paid"
    }
  });

  return {
    totalProducts,
    activeProducts,
    totalOrders,
    pendingOrders
  };
 }
}
export default OrderService;