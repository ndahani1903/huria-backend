// src/modules/orders/order.service.ts

import { prisma } from '../../config/db';
import { io } from "../../server"; 
import { calculateDistance } from '../../utils/distance';
import { DeliveryFeeService } from '../../services/delivery.service';
import { DriverService } from '../drivers/driver.service';
import redis from "../../config/redis";
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
import { LogisticsService } from '../../services/logistics.service';
import { CartItemLogistics } from '../../types/logistics.types';
import driverGamificationService from '../drivers/gamification.service';

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
  promoCode?: string,
  customDelivery?: { lat: number; lng: number; address: string }
) {
  console.log("📦 Checkout service called with userId:", userId);
  console.log("📦 Items:", items);
  console.log("🎟️ Promo code:", promoCode);

  // ============= VALIDATION =============
  if (!items || items.length === 0) {
    throw new Error("Cart is empty");
  }

  if (!userId) {
    throw new Error("User ID is required");
  }

  // ============= STEP 1: Get delivery location =============
  let deliveryLat: number, deliveryLng: number, deliveryAddress: string;
  
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
    const defaultAddress = await prisma.address.findFirst({
      where: { userId, isDefault: true }
    });
    if (!defaultAddress) throw new Error("Please add a delivery address");
    deliveryLat = defaultAddress.lat;
    deliveryLng = defaultAddress.lng;
    deliveryAddress = defaultAddress.address;
  }

  // ============= STEP 2: Get product details and group by merchant =========
  const merchantItemsMap = new Map();
  let subtotal = 0;
  let hasPreAppliedDiscount = false;
  let preAppliedDiscountPercent = 0;

  // Build cart items with logistics data
    const cartItemsWithLogistics: CartItemLogistics[] = [];

  for (const item of items) {
    const product = await prisma.product.findUnique({
      where: { id: item.productId },
    });

    if (!product) {
      throw new Error(`Product with ID ${item.productId} not found`);
    }
  
    const isRestaurantItem = product.category === 'restaurant' || 
                           product.preparationTime !== null || 
                           product.dietaryInfo?.length > 0;

    if (!isRestaurantItem && product.stock < item.quantity) {
      throw new Error(`Insufficient stock for ${product.name}. Available: ${product.stock}`);
    }

    // Get product logistics info
      const weightBracket = (product as any).weightBracket || 'LIGHT';
      const allowedVehicles = (product as any).allowedVehicles || ['motorcycle', 'bajaj', 'truck'];
      
      cartItemsWithLogistics.push({
        productId: item.productId,
        quantity: item.quantity,
        weightBracket,
        allowedVehicles
      });


    // ✅ IMPORTANT: The price from frontend is the FINAL discounted price
    // If originalPrice > price, a discount has already been applied (flash sale)
    const discountedPrice = Number(item.price);
    const originalPrice = Number(item.originalPrice) || toNumber(product.price);
    const modifierTotal = item.modifierTotal || 0;
    const itemTotal = (discountedPrice * item.quantity) + modifierTotal;
    subtotal += itemTotal;

   console.log(`💰 Item ${product.name}: price=${discountedPrice}, modifiers=${modifierTotal}, total=${itemTotal}`);

    // ✅ Detect if product already has a pre-applied discount (flash sale)
    if (originalPrice > discountedPrice) {
      hasPreAppliedDiscount = true;
      const discountPercent = ((originalPrice - discountedPrice) / originalPrice) * 100;
      preAppliedDiscountPercent = Math.max(preAppliedDiscountPercent, discountPercent);
      console.log(`🔍 Product ${product.name}: Original ${originalPrice} → Discounted ${discountedPrice} (${discountPercent}% off - already applied)`);
    }

    if (!merchantItemsMap.has(product.merchantId)) {
      merchantItemsMap.set(product.merchantId, []);
    }
    merchantItemsMap.get(product.merchantId).push({
      ...item,
      product,
      discountedPrice,
      originalPrice,
      price: discountedPrice
    });
  }

 // ============= STEP 3: Get merchant location =============
  const merchantIds = Array.from(merchantItemsMap.keys());

   if (merchantIds.length !== 1) {
      throw new Error("Cart contains items from multiple merchants. Please checkout each merchant separately.");
    }

  const merchantId = merchantIds[0];
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { id: true, pickupLat: true, pickupLng: true, businessName: true, phone: true, name: true }
    });

  if (!merchant || !merchant.pickupLat || !merchant.pickupLng) {
      throw new Error("Merchant pickup location not configured");
    }

    const merchantLocation = { lat: merchant.pickupLat, lng: merchant.pickupLng };
    const customerLocation = { lat: deliveryLat, lng: deliveryLng };
  
 // ============= STEP 4: LOGISTICS EVALUATION (NEW!) =============

   const currentHour = new Date().getHours();
    const logisticsResult = LogisticsService.evaluateCartLogistics(
      cartItemsWithLogistics,
      merchantLocation,
      customerLocation,
    { hour: currentHour, isRaining: false }
    );
    
    console.log("🚚 Logistics Result:", {
    totalWeight: logisticsResult.totalWeight,
    finalVehicle: logisticsResult.finalVehicle,
    shippingMode: logisticsResult.shippingMode,
    baseFee: logisticsResult.baseFee,
    surgeMultiplier: logisticsResult.surgeMultiplier,
    surgeAmount: logisticsResult.surgeAmount,
    deliveryFee: logisticsResult.deliveryFee,
    deliveryTimeline: logisticsResult.deliveryTimeline,
    isOutOfRange: logisticsResult.isOutOfRange
  });

    const totalDeliveryFee = logisticsResult.deliveryFee;
    const isFBU = logisticsResult.shippingMode === 'FBU_COURIER';
    const finalVehicle = logisticsResult.finalVehicle;


  // ============= STEP 5: Get subscription benefits =============
  const subscription = await prisma.subscription.findFirst({
    where: {
      userId,
      status: 'active',
      startDate: { lte: new Date() },
      endDate: { gte: new Date() }
    }
  });

  let subscriptionDiscount = 0;
  let freeDelivery = false;
  let subscriptionTier = null;

  if (subscription) {
    const tierInfo = SUBSCRIPTION_TIERS[subscription.tier];
    if (tierInfo) {
      subscriptionDiscount = tierInfo.benefits.discountPercentage;

      // ✅ Only apply free delivery if distance is within the tier's limit
    const maxFreeDistance = tierInfo.benefits.freeDeliveryMaxDistance;
    const deliveryDistance = logisticsResult.distanceKm;

    if (tierInfo.benefits.freeDelivery && deliveryDistance <= maxFreeDistance) {
      freeDelivery = true;
      console.log(`✅ Free delivery applied: Distance ${deliveryDistance}km within ${maxFreeDistance}km limit`);
    } else if (tierInfo.benefits.freeDelivery && deliveryDistance > maxFreeDistance) {
      console.log(`⚠️ Free delivery NOT applied: Distance ${deliveryDistance}km exceeds ${maxFreeDistance}km limit`);
    }

      subscriptionTier = subscription.tier;
    }
  }

  // ============= STEP 6: Get welcome discount (if not used) =============
  const welcomeDiscount = await prisma.promoCode.findFirst({
    where: {
      type: 'welcome',
      isActive: true,
      startDate: { lte: new Date() },
      endDate: { gte: new Date() },
      usages: { none: { userId } }
    }
  });

  // ============= STEP 7: Apply and validate promo code =============
  let appliedPromo = null;
  let merchantPromo = null;
  let globalPromo = null;

  if (promoCode) {
    const promo = await prisma.promoCode.findFirst({
      where: {
        code: promoCode.toUpperCase(),
        isActive: true,
        startDate: { lte: new Date() },
        endDate: { gte: new Date() }
      }
    });

    if (promo) {
      // Check if merchant promo
      if (promo.merchantId) {
        const merchantInOrder = merchantIds.includes(promo.merchantId);
        if (merchantInOrder) {
          merchantPromo = promo;
        } else {
          throw new Error(`Promo code ${promoCode} is not valid for items in your cart`);
        }
      } else {
        globalPromo = promo;
      }
      
      // Validate promo usage
      const userUsedCount = await prisma.promoUsage.count({
        where: { promoId: promo.id, userId }
      });
      if (userUsedCount >= promo.usagePerUser) {
        throw new Error(`You have already used this promo code. Max ${promo.usagePerUser} time(s)`);
      }
      
      if (promo.usageLimit) {
        const totalUsed = await prisma.promoUsage.count({
          where: { promoId: promo.id }
        });
        if (totalUsed >= promo.usageLimit) {
          throw new Error('Promo code has reached usage limit');
        }
      }
      
      if (promo.minOrderAmount && subtotal < promo.minOrderAmount.toNumber()) {
        throw new Error(`Minimum order of TSh ${promo.minOrderAmount.toNumber().toLocaleString()} required`);
      }
      
      appliedPromo = promo;
    } else {
      throw new Error('Invalid or expired promo code');
    }
  }

  // ============= STEP 8: Select the BEST discount (ONLY ONE - highest value) =============
  interface DiscountOption {
    value: number;
    type: string;
    source: string;
    description: string;
    id?: string;
    isPreApplied?: boolean;
  }

  const availableDiscounts: DiscountOption[] = [];

  // ✅ If product already has pre-applied discount (flash sale), add it as an option
  if (hasPreAppliedDiscount && preAppliedDiscountPercent > 0) {
    availableDiscounts.push({
      value: preAppliedDiscountPercent,
      type: 'flashsale',
      source: 'platform',
      description: `Flash Sale (${preAppliedDiscountPercent}%) - Already Applied`,
      isPreApplied: true
    });
  }

  // Global Admin Promo (only if no pre-applied discount OR promo is better)
  if (globalPromo && !hasPreAppliedDiscount) {
    availableDiscounts.push({
      value: globalPromo.discountValue,
      type: 'promo',
      source: 'admin',
      description: `Admin Promo: ${globalPromo.code}`,
      id: globalPromo.id
    });
  }

  // Subscription Discount (only if no pre-applied discount OR subscription is better)
  if (subscriptionDiscount > 0 && !hasPreAppliedDiscount) {
    availableDiscounts.push({
      value: subscriptionDiscount,
      type: 'subscription',
      source: 'platform',
      description: `${subscriptionTier} Plan (${subscriptionDiscount}%)`
    });
  }

  // Welcome Discount (only if no pre-applied discount)
  if (welcomeDiscount && welcomeDiscount.discountValue > 0 && !hasPreAppliedDiscount) {
    availableDiscounts.push({
      value: welcomeDiscount.discountValue,
      type: 'welcome',
      source: 'platform',
      description: `Welcome Discount (${welcomeDiscount.discountValue}%)`,
      id: welcomeDiscount.id
    });
  }

  // Merchant Promo (only if no pre-applied discount)
  if (merchantPromo && !hasPreAppliedDiscount) {
    availableDiscounts.push({
      value: merchantPromo.discountValue,
      type: 'promo',
      source: 'merchant',
      description: `Merchant Promo: ${merchantPromo.code}`,
      id: merchantPromo.id
    });
  }

  // Select the best discount (highest value)
  let bestDiscount: DiscountOption | null = null;
  let finalDiscountPercentage = 0;
  let discountType = null;
  let discountSource = null;
  let selectedPromoId = null;

  if (availableDiscounts.length > 0) {
    availableDiscounts.sort((a, b) => b.value - a.value);
    bestDiscount = availableDiscounts[0];
    
    // ✅ If the best discount is pre-applied (flash sale already in price), DON'T apply again!
    if (bestDiscount.isPreApplied) {
      finalDiscountPercentage = 0;  // Already applied in product price
      discountType = bestDiscount.type;
      discountSource = bestDiscount.source;
      console.log(`✅ Product already has ${bestDiscount.description}. No additional discount applied.`);
    } else {
      finalDiscountPercentage = bestDiscount.value;
      discountType = bestDiscount.type;
      discountSource = bestDiscount.source;
      selectedPromoId = bestDiscount.id;
      console.log(`🏆 BEST DISCOUNT SELECTED: ${bestDiscount.description}`);
    }
    
    console.log(`   Other discounts ignored: ${availableDiscounts.slice(1).map(d => d.description).join(', ') || 'none'}`);
  }

  // Calculate discount amount
  const discountAmount = (subtotal * finalDiscountPercentage) / 100;
  const finalAmount = subtotal - discountAmount;
  const finalDeliveryFee = freeDelivery ? 0 : totalDeliveryFee;
  const orderTotal = finalAmount + finalDeliveryFee;

  console.log(`💰 ORDER TOTALS:
    Subtotal: TSh ${subtotal.toLocaleString()}
    Discount: ${finalDiscountPercentage}% (-TSh ${discountAmount.toLocaleString()})
    Delivery: TSh ${finalDeliveryFee.toLocaleString()}
    Total: TSh ${orderTotal.toLocaleString()}
    Free Delivery: ${freeDelivery ? 'YES' : 'NO'}
    Shipping Mode: ${logisticsResult.shippingMode}
    Vehicle: ${finalVehicle}`)

  // ============= STEP 9: Create orders =============
    const pickupAddress = await MapsService.reverseGeocode(merchant.pickupLat, merchant.pickupLng);
        
    const businessOrderId = `ORD-${Date.now()}-${merchantId.slice(-4)}`;

    const merchantItems = merchantItemsMap.get(merchantId);

     if (!merchantItems) {
  throw new Error('No items found for merchant');
}

    // Create order
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          orderId: businessOrderId,
          amount: subtotal,
          totalAmount: orderTotal,
          userId,
          merchantId: merchant.id, 
          status: 'pending',
          tripStage: 'pending',
          pickupLat: merchant.pickupLat,
          pickupLng: merchant.pickupLng,
          pickupAddress,
          deliveryLat,
          deliveryLng,
          deliveryAddress,
          deliveryAddressId: deliveryAddressId,
          deliveryFee: finalDeliveryFee,
          discountPercentage: finalDiscountPercentage,
          discountAmount: discountAmount,
          finalAmount: orderTotal,
          expiresAt: new Date(Date.now() + 30 * 60 * 1000),
          // NEW LOGISTICS FIELDS
          shippingMode: logisticsResult.shippingMode,
          assignedVehicle: finalVehicle === 'warehouse_sorting' ? null : finalVehicle,
        logisticsMetadata: {
          totalWeight: logisticsResult.totalWeight,
          distanceKm: logisticsResult.distanceKm,
          finalVehicle: logisticsResult.finalVehicle,
          systemSuggestedVehicle: logisticsResult.systemSuggestedVehicle,
          allowedVehiclesInCart: logisticsResult.allowedVehiclesInCart,
          isOutOfRange: logisticsResult.isOutOfRange,
          deliveryTimeline: logisticsResult.deliveryTimeline,
          surgeMultiplier: logisticsResult.surgeMultiplier,
          baseFee: logisticsResult.baseFee,
          surgeAmount: logisticsResult.surgeAmount
        },
          metadata: {
            freeDeliveryApplied: freeDelivery,
            discountType: discountType,
            discountSource: discountSource,
            discountValue: finalDiscountPercentage,
            originalSubtotal: subtotal,
            promoCode: promoCode || null,
            promoApplied: !!bestDiscount && !bestDiscount.isPreApplied,
            subscriptionTier: subscriptionTier,
            welcomePromoApplied: discountType === 'welcome',
            flashSaleApplied: discountType === 'flashsale',
            dealApplied: merchantItems.some(item => item.product?.isDeal === true),
            hasPreAppliedDiscount: hasPreAppliedDiscount,
            preAppliedDiscountPercent: preAppliedDiscountPercent
          }
        },
      });

      console.log(`✅ Order created with ID: ${newOrder.id} (Business ID: ${businessOrderId})`);

      // Create order items and update stock
      for (const item of merchantItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } }
        });

      const selectedModifiers = item.selectedModifiers || [];
  
  // Calculate modifier total
  let modifierTotal = 0;
  for (const mod of selectedModifiers) {
    modifierTotal += mod.price * mod.quantity;
  }
  
  // Final price = item price + modifier total
  const finalItemPrice = item.discountedPrice + modifierTotal;

      const orderItem =  await tx.orderItem.create({
          data: {
            orderId: newOrder.id,
            productId: item.productId,
            quantity: item.quantity,
            price: finalItemPrice, 
            merchantId: item.product.merchantId
          }
        });

       // Create order item modifiers
  if (selectedModifiers.length > 0) {
    await tx.orderItemModifier.createMany({
      data: selectedModifiers.map(mod => ({
        orderItemId: orderItem.id,
        name: mod.name,
        price: mod.price,
        quantity: mod.quantity
      }))
    });
  }
      }

      return newOrder;
    });

    // ✅ Record promo usage AFTER transaction (only if promo was applied and NOT pre-applied)
    if (selectedPromoId && discountType === 'promo' && !hasPreAppliedDiscount) {
      try {
        await subscriptionService.recordPromoUsage(
          selectedPromoId,
          userId,
          businessOrderId,
          discountAmount
        );
        console.log(`📝 Promo usage recorded for ${promoCode} with order: ${businessOrderId}`);
      } catch (promoError) {
        console.error(`⚠️ Failed to record promo usage:`, promoError);
        // Don't fail the order if promo recording fails
      }
    }

    // ============= STEP 10: Create FBU Warehouse Request if needed =============
    if (logisticsResult.shippingMode === 'FBU_COURIER') {
      console.log(`🏭 Creating FBU warehouse request for order ${businessOrderId}`);
      await LogisticsService.createFBUWarehouseRequest(order.orderId);
    }

    // Send notifications and emit events
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (user?.phone) {
      await SMSService.sendOrderCreated(user.phone, businessOrderId);
    }
    
    await NotificationService.notifyOrderCreated(userId, `Order ${businessOrderId} created successfully`);
    
    io.emit("order:new", {
      orderId: businessOrderId,
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
      shippingMode: order.shippingMode,
      assignedVehicle: order.assignedVehicle
    });

  return order;
}

/**
   * Helper: Validate promo code and calculate discount
   */
  private static async validateAndGetPromo(code: string, userId: string, subtotal: number): Promise<any> {
    const promo = await prisma.promoCode.findFirst({
      where: {
        code: code.toUpperCase(),
        isActive: true,
        startDate: { lte: new Date() },
        endDate: { gte: new Date() }
      }
    });
    
    if (!promo) {
      return { valid: false, message: 'Invalid or expired promo code' };
    }
    
    // Check minimum order
    if (promo.minOrderAmount && subtotal < promo.minOrderAmount.toNumber()) {
      return { 
        valid: false, 
        message: `Minimum order of TSh ${promo.minOrderAmount.toNumber().toLocaleString()} required` 
      };
    }
    
    // Check total usage limit
    if (promo.usageLimit) {
      const totalUsed = await prisma.promoUsage.count({
        where: { promoId: promo.id }
      });
      if (totalUsed >= promo.usageLimit) {
        return { valid: false, message: 'Promo code has reached usage limit' };
      }
    }
    
    // Check per-user usage
    const userUsed = await prisma.promoUsage.count({
      where: { promoId: promo.id, userId }
    });
    if (userUsed >= promo.usagePerUser) {
      return { valid: false, message: 'You have already used this promo code' };
    }
    
    // Calculate discount
    let discountAmount = 0;
    if (promo.discountType === 'percentage') {
      discountAmount = (subtotal * promo.discountValue) / 100;
      if (promo.maxDiscount && discountAmount > promo.maxDiscount.toNumber()) {
        discountAmount = promo.maxDiscount.toNumber();
      }
    } else {
      discountAmount = Math.min(promo.discountValue, subtotal);
    }
    
    return {
      valid: true,
      promo,
      discountAmount
    };
  }

static async markPaid(orderId: string) {
    const order = await prisma.order.findUnique({
      where: { orderId },
      include: { 
        user: true,
        merchant: true 
      }
    });

   if (!order) throw new Error('Order not found');

   // ✅ Only update if not already paid
  if (order.status === 'paid') {
    return order;
  }

    const updated = await prisma.order.update({
      where: { orderId },
      data: { status: 'paid' },
    });

      // ============ DISPATCH DECISION BASED ON MERCHANT TYPE ============
  const merchantType = order.merchant?.merchantType;
  const isRestaurant = merchantType === 'RESTAURANT';
  const isSupermarket = merchantType === 'SUPERMARKET';

  if (isRestaurant) {
    // ======= RESTAURANT: STEP 1 - Merchant Acceptance First =======
    console.log(`🍽️ Restaurant order ${orderId} - Starting merchant acceptance phase`);
    
    // Call PriorityOrderService to handle merchant acceptance (5 min deadline)
    const { PriorityOrderService } = await import('./priorityOrder.service');
    await PriorityOrderService.processRestaurantOrder(order.orderId);
    
    // NOT auto-dispatching driver yet - wait for merchant to accept
    // Driver will be dispatched after merchant marks order as ready

   } else if (isSupermarket) {
    // ============ SUPERMARKET: Direct to Manual Driver Dispatch ============
    console.log(`🛒 Supermarket order ${orderId} - Sent to MANUAL driver dispatch`);

    // Add to manual dispatch queue (no merchant acceptance needed)
    // ✅ CORRECT PRISMA POSTGRESQL CODE - Using Prisma ORM directly
    await prisma.manualDispatchQueue.upsert({
      where: { orderId: orderId },
      update: { 
        status: 'pending', 
        updatedAt: new Date() 
      },
      create: {
        orderId: orderId,
        merchantId: order.merchantId,
        merchantType: 'SUPERMARKET',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });

    console.log(`✅ Supermarket order ${orderId} added to ManualDispatchQueue via Prisma`);

   // Notify admin dashboard
    io.emit("admin:new-manual-dispatch", {
      orderId,
      merchantType: 'SUPERMARKET',
      merchantName: order.merchant?.businessName || order.merchant?.name,
      amount: order.finalAmount || order.amount,
      createdAt: new Date().toISOString()
    });

    // Send SMS to merchant
    if (order.merchant?.phone) {
      await SMSService.sendRealSMS(
        order.merchant.phone,
        `🛒 NEW ORDER #${orderId.slice(-8)}!\nAmount: TSh ${(order.finalAmount || order.amount).toLocaleString()}\nAwaiting admin driver assignment. Prepare order now.`
      );
    }

  } else {
    // ============ OTHER MERCHANTS: Auto Dispatch ============
    console.log(`📦 Standard order ${orderId} - Starting AUTO dispatch`);

   // ✅ START DRIVER ASSIGNMENT PROCESS (CRITICAL!)
    const { DriverAssignmentService } = await import('../../services/driverAssignment.service');
    await DriverAssignmentService.startAssignment(orderId);
    }
    console.log(`🚀 Driver assignment process started for order ${orderId}`);


// Send customer notification (common for all order types)
  if (order.user?.phone) {
    const message = isRestaurant 
      ? `✅ Order #${orderId.slice(-8)} confirmed! The restaurant will confirm your order shortly.`
      : `✅ Order #${orderId.slice(-8)} confirmed! We'll notify you when a driver is assigned.`;
    
    await SMSService.sendRealSMS(order.user.phone, message);
  }

  io.emit("order:update", { orderId, status: "paid" });

  return updated;
}

  static generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }


// Merchant confirms order is ready
static async merchantConfirmOrder(orderId: string, merchantId: string) {
    // Verify order belongs to merchant first
  const order = await prisma.order.findFirst({
      where: { 
        orderId: orderId,
        merchantId: merchantId 
      },
      include: { merchant: true }
    });
  
  if (!order) throw new Error("Order not found or unauthorized");
    if (order.merchantId !== merchantId) throw new Error("Unauthorized");

   // Check if already confirmed
  if (order.merchantConfirmed) {
    throw new Error("Order already confirmed");
  }


  const isSupermarket = order.merchant?.merchantType === 'SUPERMARKET';
    const isRestaurant = order.merchant?.merchantType === 'RESTAURANT';

    // For Supermarket and Restaurant - Add to Manual Dispatch Queue
  if (isSupermarket || isRestaurant) {
      console.log(`🛒 ${order.merchant?.merchantType} order ${orderId} - Adding to MANUAL dispatch queue`);
      
         // Add to manual dispatch queue using Prisma
    await prisma.manualDispatchQueue.upsert({
      where: { orderId: orderId },
      update: { status: 'pending', updatedAt: new Date() },
      create: {
        orderId: orderId,
        merchantId: order.merchantId,
        merchantType: order.merchant?.merchantType || (isSupermarket ? 'SUPERMARKET' : 'RESTAURANT'),
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
      
      // Update order status
      const updated = await prisma.order.update({
        where: { id: order.id },
        data: { 
          merchantConfirmed: true,
          readyForPickup: true,
          tripStage: 'ready_for_pickup',
          status: 'ready_for_pickup', // Don't auto-assign driver
         driverId: null
        }
      });
      
      // Notify admin
    io.emit("admin:new-manual-dispatch", {
      orderId,
      merchantType: order.merchant?.merchantType,
      merchantName: order.merchant?.businessName || order.merchant?.name,
      amount: order.finalAmount || order.amount,
      createdAt: new Date().toISOString()
    });
    
      
      // Notify customer
      if (order.user?.phone) {
        await SMSService.sendRealSMS(
          order.user.phone,
          `🛒 Order #${orderId.slice(-8)} is ready for pickup! We're assigning a driver.`
        );
      }
      
      console.log(`✅ ${order.merchant?.merchantType} order ${orderId} added to ManualDispatchQueue`);
    return updated;
  }
    

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: { 
        merchantConfirmed: true,
        readyForPickup: true,
        tripStage: 'ready_for_pickup'
      }
    });

    io.emit("order:update", { 
       orderId,
       status: order.status,
       tripStage: 'ready_for_pickup'
     });
    
    // Notify drivers that order is ready
    io.emit("order:ready", { 
        orderId, 
        pickupLat: order.pickupLat,
        pickupLng: order.pickupLng 
     });
    
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
        user: true,
        merchant: true
      }
    });



if (!order) {
  throw new Error('Order not found');
}

  console.log(`📦 Order found - Status: ${order.status}, OTP in DB: ${order.otp}`);


// ✅ FBU ORDERS: No OTP required
    const isFBU = order.shippingMode === 'FBU_COURIER';
    
    if (!isFBU && order.status === 'delivered') {
   // Local order - require OTP, Verify OTP (only if status is delivered)
      if (order.otp !== otp) {
        throw new Error('Invalid OTP');
      }
     } else if (isFBU) {
      // FBU order - either admin override or just complete
      console.log('🏭 FBU Order - No OTP required for completion');
      if (!isAdminOverride && order.status !== 'delivered') {
        // For FBU, we should mark as delivered first
        console.log('FBU order must be marked as delivered before completion');
         if (!isAdminOverride) {
          console.log('🏭 Auto-marking FBU order as delivered');
          await prisma.order.update({
            where: { orderId },
            data: { 
              status: 'delivered', 
              tripStage: 'delivered',
              deliveryArrivalTime: new Date()
            }
          });
        }
      }
    }

// Check if already completed
  if (order.status === 'completed') {
    throw new Error('Order already completed');
  }
 

     // ✅ CHECK IF ESCROW EXISTS BEFORE RELEASING
    let escrowExists = await prisma.escrow.findFirst({
      where: { 
        OR: [
          { orderId: orderId },
          { orderId: order.id }
        ]
      }
    });

   if (!escrowExists) {
      console.log(`⚠️ No escrow found for order ${orderId}, creating one...`);
      
    }

     // ✅ RELEASE PAYMENT FROM ESCROW
    await EscrowService.releasePayment(orderId);
 console.log(`💰 Payment released from escrow for order ${orderId}`);
    

   // ✅ UPDATE ORDER STATUS TO COMPLETED
    const updated = await prisma.order.update({
      where: { orderId },
      data: { 
        status: 'completed', 
        tripStage: 'completed',
        completedAt: new Date()
      },
    });

    console.log(`✅ Order ${orderId} status updated to completed`);

   // After order is completed successfully, check if this is user's first order
  const userOrderCount = await prisma.order.count({
    where: { 
      userId: order.userId,
      status: 'completed'
    }
  });
  

  // ✅ UPDATE MERCHANT TIER (only once)
    if (updated.merchantId) {
      await merchantTierService.evaluateAndUpgrade(updated.merchantId);
      console.log(`📈 Merchant tier evaluated for ${updated.merchantId}`);
    }

 // 🔥 FREE DRIVER
  if (updated.driverId) {
      try {
         // Update gamification stats only (not financial)
        await driverGamificationService.updateDriverStats(updated.driverId, orderId);
        console.log(`🏆 Gamification updated for driver ${updated.driverId}`);
      } catch (error) {
        console.error('Gamification update failed:', error);
      }

      try {
        await DriverService.markAvailable(updated.driverId);
        console.log(`🚚 Driver ${updated.driverId} marked as available`);
      }  catch (driverError) {
        console.error("Driver availability error:", driverError);
      }
  }


     // ✅ EMIT REAL-TIME UPDATES
    io.to(`user:${order.userId}`).emit("order:update", {
      orderId, 
      status: "completed", 
      tripStage: "completed"
    });
    
    io.to(`merchant:${updated.merchantId}`).emit("order:update", {
      orderId, 
      status: "completed", 
      tripStage: "completed"
    });
    
    if (updated.driverId) {
      io.to(`driver:${updated.driverId}`).emit("order:update", {
        orderId, 
        status: "completed", 
        tripStage: "completed"
      });
    }
    
    console.log("📡 Order completion events emitted for:", orderId);

  return updated;
  } catch (error: any) {
    console.error("❌ Complete order error:", error.message);
    console.error("Stack:", error.stack);
    throw error; // Re-throw to be caught by controller
  }
}

  static async get(orderId: string) {
    return prisma.order.findUnique({
      where: { orderId: orderId },
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

static async previewDelivery(userId: string, items: any[], deliveryAddressId: string) {
  const address = await prisma.address.findUnique({
    where: { id: deliveryAddressId }
  });

  if (!address) throw new Error("Address not found");

  // 🌧🌙🔥 DETECT SURGE CONDITIONS
  const hour = new Date().getHours();
  const merchantMap = new Map();

  for (const item of items) {
    const product = await prisma.product.findUnique({
      where: { id: item.productId }
    });
    if (!product) continue;
    if (!merchantMap.has(product.merchantId)) {
      merchantMap.set(product.merchantId, []);
    }
    merchantMap.get(product.merchantId).push(item);
  }

  let totalFee = 0;
  const result = [];

  for (const [merchantId] of merchantMap) {
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId }
    });
    if (!merchant) continue;

    const distance = calculateDistance(
      merchant.pickupLat,
      merchant.pickupLng,
      address.lat,
      address.lng
    );

    // ✅ Use unified delivery fee calculation
    const feeResult = DeliveryFeeService.calculateDeliveryFee({
      distanceKm: distance,
      hour: hour,
      isRaining: false
    });

    totalFee += feeResult.deliveryFee;
    result.push({
      merchantId,
      distance: distance.toFixed(2),
      baseFee: feeResult.baseFee,
      surgeMultiplier: feeResult.surgeMultiplier,
      finalFee: feeResult.deliveryFee,
      breakdown: feeResult.breakdown
    });
  }

  return {
    breakdown: result,
    totalDeliveryFee: totalFee,
    surgeMultiplier: result[0]?.surgeMultiplier || 1,
    calculationMethod: "unified_v1"
  };
}

static async shouldUseManualDispatch(orderId: string): Promise<boolean> {
  const order = await prisma.order.findUnique({
    where: { orderId },
    include: {
      merchant: {
        select: { merchantType: true }
      }
    }
  });

  if (!order || !order.merchant) {
    return false;
  }

  // Restaurant and Supermarket orders require manual dispatch
  return order.merchant.merchantType === 'RESTAURANT' || 
         order.merchant.merchantType === 'SUPERMARKET';
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