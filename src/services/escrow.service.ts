import { prisma } from '../config/db';
import { MerchantWalletService } from '../modules/merchants/merchantWallet.service';
import { WalletService } from '../modules/wallet/wallet.service';
import { Decimal } from "@prisma/client/runtime/library";

export const toNumber = (val: any): number => {
  if (!val) return 0;
  if (val instanceof Decimal) return val.toNumber();
  return Number(val);
};

export class EscrowService {
  
  // Hold payment when customer pays
  static async holdPayment(orderId: string, amount: number, customerId: string) {
    console.log(`🔒 EscrowService.holdPayment called with orderId: "${orderId}"`);

    // ✅ Check if this is a business ID or UUID
  let actualOrderId = orderId;
  let order;
  
  // If it looks like a business ID (starts with ORD-), convert to UUID
  if (orderId.startsWith('ORD-')) {
    order = await prisma.order.findUnique({
      where: { orderId: orderId },
      include: { items: { include: { product: true } } }
    });
    if (order) {
      actualOrderId = order.id;
      console.log(`🔍 Converted business ID ${orderId} to UUID ${actualOrderId}`);
    }
  } else {
    order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true } } }
    });
  }
  
  if (!order) {
    throw new Error('Order not found');
  }

   // ✅ Check if escrow already exists - use different variable name
  const existingEscrow = await prisma.escrow.findUnique({
    where: { orderId: actualOrderId }
  });
  
  if (existingEscrow) {
    console.log(`⚠️ Escrow already exists for order ${actualOrderId}`);
    return existingEscrow;
  }
    
// Calculate merchant shares (40% to merchants total, split by order value)
  const merchantMap = new Map();
  let totalItemValue = 0;
    
    // ✅ STORE THE FULL AMOUNT IN ESCROW
  const newEscrow = await prisma.escrow.create({
    data: {
      orderId: actualOrderId,
      amount: amount,  // Full customer payment
      status: 'held',
      customerId: customerId,
      createdAt: new Date()
    }
  });
  
  // ✅ Merchants get their product amounts (full product price - platform fee)
  // This is handled when order is completed - they get 85% of product price
  for (const item of order.items) {
    const merchantId = item.product.merchantId;
    const itemValue = toNumber(item.price) * item.quantity;
    
    // ✅ Store the FULL merchant amount (will be released with 15% commission)
    if (merchantMap.has(merchantId)) {
      merchantMap.set(merchantId, merchantMap.get(merchantId) + itemValue);
    } else {
      merchantMap.set(merchantId, itemValue);
    }
  }
  
  // Create escrow-merchant mappings with FULL product amounts
  for (const [merchantId, merchantAmount] of merchantMap) {
    await prisma.escrowMerchant.create({
      data: {
        escrowId: newEscrow.id,
        merchantId,
        amount: merchantAmount,  // Full product amount
        status: 'pending',
        orderId: actualOrderId,
      }
    });
      
      // Add pending credit to merchant wallet
      await MerchantWalletService.addPendingCredit(merchantId, order.orderId, merchantAmount);
    }
    
     console.log(`💰 Escrow held for order ${order.orderId}: ${amount} TZS (${merchantMap.size} merchants)`);

     return newEscrow;
  }
  


 // Release payment when order is completed
 static async releasePayment(orderId: string) {
     console.log(`🔓 EscrowService.releasePayment called with orderId: "${orderId}"`);

    // ✅ FIRST: Try to find escrow directly
  let escrow = await prisma.escrow.findUnique({
    where: { orderId: orderId },
    include: {
      order: {
        include: {
          items: {
            include: { product: true }
          }
        }
      }
    }
  });


// ✅ SECOND: If not found and it looks like a business ID (starts with ORD-), try to get UUID
  if (!escrow && orderId.startsWith('ORD-')) {
    console.log(`🔍 Business ID detected, looking up UUID...`);
    const order = await prisma.order.findUnique({
      where: { orderId: orderId },
      select: { id: true }
    });
    
    if (order) {
      console.log(`🔍 Found UUID: ${order.id}, looking for escrow...`);
      escrow = await prisma.escrow.findUnique({
        where: { orderId: order.id },
        include: {
          order: {
            include: {
              items: {
                include: { product: true }
              }
            }
          }
        }
      });
    }
  }
  
  // ✅ THIRD: If still not found, try to search by orderId as string
  if (!escrow) {
    console.log(`🔍 Searching escrow by orderId as string...`);
    const allEscrows = await prisma.escrow.findMany({
      take: 5,
      select: { orderId: true }
    });
    console.log(`📋 Existing escrow orderIds:`, allEscrows.map(e => e.orderId));
  }
    
    if (!escrow) {
    console.error(`❌ Escrow not found for orderId: ${orderId}`);
    throw new Error('Escrow not found');
  }
  
  console.log(`✅ Escrow found with ID: ${escrow.orderId}`);
  
  if (escrow.status !== 'held') throw new Error('Payment not in escrow');
    
    

    // ✅ CORRECT SPLIT LOGIC:
  // - Driver gets ONLY the delivery fee (from order.deliveryFee)
  // - Merchants get their product amount (already in pending credits)
  // - Platform gets commission from delivery fee

    const totalPaid = toNumber(escrow.amount);
  const deliveryFee = toNumber(escrow.order.deliveryFee || 0);
  const productTotal = toNumber(escrow.order.amount || 0); // Original product total BEFORE discounts
  const discountAmount = toNumber(escrow.order.discountAmount || 0);
  const discountPercentage = toNumber(escrow.order.discountPercentage || 0);
  const freeDeliveryApplied = escrow.order.metadata?.freeDeliveryApplied === true;
  const discountType = escrow.order.metadata?.discountType || null; // 'promo', 'subscription', 'flashsale', 'merchant_promo', 'welcome'
  const discountSource = escrow.order.metadata?.discountSource || null; // 'admin', 'merchant', 'subscription'

  // ============= ✅ ADD FBU DETECTION HERE (BEFORE ANY SPLIT) =============
  const isFBU = escrow.order.shippingMode === 'FBU_COURIER';
  
  if (isFBU) {
    console.log(`🏭 FBU ORDER DETECTED - Delivery fee handled separately`);
    console.log(`   Delivery Fee: TSh ${deliveryFee.toLocaleString()} (goes to platform for external transport)`);
    console.log(`   No driver payment from escrow for FBU orders`);
  }

  // ============= STEP 1: COMMISSION CALCULATIONS (ALWAYS APPLY) =============
  const COMMISSION_RATE = 0.15; // 15%

    // Driver calculation - BUT SKIP FOR FBU
  let driverBasePayment = 0;
  let platformDeliveryCommission = 0;
  let driverPayment = 0;


   if (!isFBU) {
    // Only calculate driver payment for non-FBU orders, Driver ALWAYS gets 85% of delivery fee (commission applies)
    driverBasePayment = deliveryFee * (1 - COMMISSION_RATE);
    platformDeliveryCommission = deliveryFee * COMMISSION_RATE;
    driverPayment = driverBasePayment;
  } else {
    // For FBU: Entire delivery fee goes to platform
    platformDeliveryCommission = deliveryFee;
    console.log(`🏭 FBU: Full delivery fee TSh ${deliveryFee.toLocaleString()} added to platform revenue`);
  }


   // Merchant ALWAYS gets 85% of original product price (commission applies)
  const merchantBasePayment = productTotal * (1 - COMMISSION_RATE);
  const platformProductCommission = productTotal * COMMISSION_RATE;


  const totalPlatformCommission = platformDeliveryCommission + platformProductCommission;


// ============= STEP 2: DETERMINE WHO ABSORBS THE DISCOUNT =============
  let platformAbsorbsDiscount = false;
  let merchantAbsorbsDiscount = false;
  let discountImpact = 0;

   // Platform absorbs discounts for:
  // - Admin-created promos
  // - Subscription benefits (free delivery + percentage discount)
  // - Flash sales (platform-initiated)
  // - Welcome discounts


   if (discountType === 'promo' && discountSource === 'admin') {
    platformAbsorbsDiscount = true;
    console.log(`📢 Admin promo discount - Platform absorbs ${discountAmount} TZS`);
  } 
  else if (discountType === 'subscription') {
    platformAbsorbsDiscount = true;
    console.log(`👑 Subscription benefit - Platform absorbs ${discountAmount} TZS`);
  }
  else if (discountType === 'flashsale') {
    platformAbsorbsDiscount = true;
    console.log(`⚡ Flash sale discount - Platform absorbs ${discountAmount} TZS`);
  }
  else if (discountType === 'welcome') {
    platformAbsorbsDiscount = true;
    console.log(`🎁 Welcome discount - Platform absorbs ${discountAmount} TZS`);
  }
  else if (discountType === 'promo' && discountSource === 'merchant') {
    merchantAbsorbsDiscount = true;
    console.log(`🏪 Merchant promo discount - Merchant absorbs ${discountAmount} TZS`);
  }
  else {
    // Default: platform absorbs (safety)
    platformAbsorbsDiscount = true;
  }


  // ============= STEP 3: CALCULATE FREE DELIVERY IMPACT =============
  let platformDriverCost = 0;

  if (freeDeliveryApplied && !isFBU) {
    // Platform pays driver their full 85% of delivery fee
    platformDriverCost = driverBasePayment;
    console.log(`🚚 Free delivery: Platform pays driver ${driverPayment} TZS`);
  } else if (freeDeliveryApplied && isFBU) {
    console.log(`🏭 FBU + Free delivery: No driver payment, delivery cost to platform: TSh ${deliveryFee.toLocaleString()}`);
    platformDriverCost = deliveryFee; // Platform absorbs the cost
  }


  // ============= STEP 4: APPLY DISCOUNT IMPACT =============
  let finalMerchantPayment = merchantBasePayment;
  let finalPlatformCommission = totalPlatformCommission;

  if (platformAbsorbsDiscount) {
    // Discount comes out of platform's commission
    finalPlatformCommission = totalPlatformCommission - discountAmount;
    console.log(`💸 Platform absorbs discount: Commission reduced from ${totalPlatformCommission} to ${finalPlatformCommission} TZS`);
  } 
  else if (merchantAbsorbsDiscount) {
    // Discount comes out of merchant's payment
    finalMerchantPayment = merchantBasePayment - discountAmount;
    console.log(`💸 Merchant absorbs discount: Payment reduced from ${merchantBasePayment} to ${finalMerchantPayment} TZS`);
  }

  // Platform also pays driver for free delivery
  const platformNetRevenue = finalPlatformCommission - platformDriverCost;
  const platformPaysDriverText = platformDriverCost > 0 ? `-${platformDriverCost} TZS (Free delivery)` : '0 TZS';

  // ============= STEP 5: VALIDATION =============
  // Verify the math adds up
  const totalOutgoing = finalMerchantPayment + driverPayment + platformNetRevenue;
  const customerPaid = totalPaid;

  console.log(`💰 ESCROW RELEASE BREAKDOWN:
=================================================================
📦 ORDER SUMMARY:
   Original Product Total: TSh ${productTotal.toLocaleString()}
   Discount Type: ${discountType || 'none'}
   Discount Source: ${discountSource || 'none'}
   Discount Percentage: ${discountPercentage}%
   Discount Amount: TSh ${discountAmount.toLocaleString()}
   Free Delivery: ${freeDeliveryApplied ? 'YES' : 'NO'}
   Customer Paid: TSh ${customerPaid.toLocaleString()}

👨‍💼 MERCHANT:
   Original Product: TSh ${productTotal.toLocaleString()}
   Commission (15%): -TSh ${platformProductCommission.toLocaleString()}
   Base Payment: TSh ${merchantBasePayment.toLocaleString()}
   Discount Absorbed: ${merchantAbsorbsDiscount ? `-TSh ${discountAmount.toLocaleString()}` : '0 TZS'}
   ───────────────────
   MERCHANT RECEIVES: TSh ${finalMerchantPayment.toLocaleString()}

🚚 DRIVER:
   Delivery Fee: TSh ${deliveryFee.toLocaleString()}
   Commission (15%): -TSh ${platformDeliveryCommission.toLocaleString()}
   Base Payment: TSh ${driverBasePayment.toLocaleString()}
   Free Delivery Cover: ${freeDeliveryApplied ? `+TSh ${driverBasePayment} (Platform pays)` : '0 TZS'}
   ───────────────────
   DRIVER RECEIVES: TSh ${driverPayment.toLocaleString()}

🏦 PLATFORM:
  Product Commission: TSh ${platformProductCommission.toLocaleString()}
   Delivery Commission: TSh ${platformDeliveryCommission.toLocaleString()}
   Total Commission: TSh ${totalPlatformCommission.toLocaleString()}
   Discount Absorbed: ${platformAbsorbsDiscount ? `-TSh ${discountAmount.toLocaleString()}` : '0 TZS'}
   Free Delivery Cost: ${platformDriverCost > 0 ? `-TSh ${platformDriverCost.toLocaleString()}` : '0 TZS'}
   ───────────────────
   PLATFORM NET REVENUE: TSh ${platformNetRevenue.toLocaleString()}

✅ VERIFICATION:
   Customer Paid: TSh ${customerPaid.toLocaleString()}
   Merchant + Driver + Platform: TSh ${(finalMerchantPayment + driverPayment + platformNetRevenue).toLocaleString()}
   BALANCED: ${Math.abs(customerPaid - (finalMerchantPayment + driverPayment + platformNetRevenue)) < 1 ? '✓' : '✗'}
=================================================================`);

  // ============= STEP 4: EXECUTE PAYMENTS =============

   // 1. Pay Driver (ONLY for non-FBU orders)
  if (!isFBU && escrow.order.driverId && driverPayment > 0) {
    try {
      await WalletService.credit(escrow.order.driverId, driverPayment);
      console.log(`🚚 Driver ${escrow.order.driverId} credited: ${driverPayment.toLocaleString()} TZS`);
    } catch (creditError) {
      console.error(`Failed to credit driver:`, creditError);
    }
  } else if (isFBU) {
    console.log(`🏭 FBU Order: No driver payment from escrow. Driver paid separately by HURIA HQ cash.`);
  }

  // 2. Release Merchant Credits
  const escrowMerchants = await prisma.escrowMerchant.findMany({
    where: { escrowId: escrow.id }
  });

  // Distribute merchant payments proportionally based on original item values
  let totalMerchantOriginal = 0;
  for (const em of escrowMerchants) {
    totalMerchantOriginal += toNumber(em.amount);
  }
  
  for (const em of escrowMerchants) {
    const merchantShare = (toNumber(em.amount) / totalMerchantOriginal) * finalMerchantPayment;
    try {
      await MerchantWalletService.credit(em.merchantId, merchantShare);
      console.log(`🏪 Merchant ${em.merchantId} credited: ${merchantShare.toLocaleString()} TZS`);
    } catch (merchantError) {
      console.error(`Failed to credit merchant:`, merchantError);
    }
    
    await prisma.escrowMerchant.update({
      where: { id: em.id },
      data: { status: 'released', releasedAt: new Date() }
    });
  }

  // 3. Update escrow status
  const updated = await prisma.escrow.update({
    where: { id: escrow.id },
    data: { status: 'released', releasedAt: new Date(), driverId: escrow.order.driverId }
  });
  
  console.log(`✅ Escrow released for order ${orderId}`);
  return updated;
}
      
  // Hold payment for dispute
  static async holdForDispute(orderId: string) {
    const escrow = await prisma.escrow.update({
      where: { orderId },
      data: { status: 'disputed' }
    });
    
    console.log(`⚠️ Escrow disputed for order ${orderId}`);
    return escrow;
  }
  
  // Refund to customer (dispute resolved in customer's favor)
  static async refundToCustomer(orderId: string) {
    const escrow = await prisma.escrow.findUnique({
      where: { orderId }
    });
    
    if (!escrow) throw new Error('Escrow not found');
    if (escrow.status !== 'disputed') throw new Error('Can only refund disputed orders');
    
     // Get all escrow-merchant mappings
    const escrowMerchants = await prisma.escrowMerchant.findMany({
      where: { escrowId: escrow.id }
    });

    // Reverse pending credits for merchants
    for (const em of escrowMerchants) {
      // Find and void pending transactions
      const wallet = await MerchantWalletService.getOrCreateWallet(em.merchantId);
      
      // Find and void pending transactions
      const pendingTransactions = await prisma.merchantTransaction.findMany({
        where: {
          walletId: wallet.id,
          orderId,
          status: 'pending'
        }
      });
      
      for (const transaction of pendingTransactions) {
        await prisma.merchantTransaction.update({
          where: { id: transaction.id },
          data: { status: 'failed' }
        });
        
        // Reduce pending balance
        await prisma.merchantWallet.update({
          where: { merchantId: em.merchantId },
          data: {
            pendingBalance: { decrement: transaction.amount }
          }
        });
      }
    
         // Update escrow-merchant status
      await prisma.escrowMerchant.update({
        where: { id: em.id },
        data: {
          status: 'refunded',
          releasedAt: new Date()
        }
      });
    }
    
    // Update escrow status
    const updated = await prisma.escrow.update({
      where: { orderId },
      data: { status: 'refunded' }
    });
    
    console.log(`💰 Order ${orderId} refunded to customer`);
    return updated;
  }
  
  // Get escrow status for an order
  static async getEscrowStatus(orderId: string) {
    const escrow = await prisma.escrow.findUnique({
      where: { orderId },
      include: {
        escrowMerchants: {
          include: {
            merchant: {
              select: { name: true, businessName: true }
            }
          }
        }
      }
    });
    
    if (!escrow) return null;
    
    return {
      orderId: escrow.orderId,
      amount: escrow.amount,
      status: escrow.status,
      customerId: escrow.customerId,
      driverId: escrow.driverId,
      createdAt: escrow.createdAt,
      releasedAt: escrow.releasedAt,
      merchants: escrow.escrowMerchants.map(em => ({
        merchantId: em.merchantId,
        merchantName: em.merchant.businessName || em.merchant.name,
        amount: em.amount,
        status: em.status
      }))
    };
  }
}