import { prisma } from '../config/db';
import { MerchantWalletService } from '../modules/merchants/merchantWallet.service';
import { WalletService } from '../modules/wallet/wallet.service';

export class EscrowService {
  
  // Hold payment when customer pays
  static async holdPayment(orderId: string, amount: number, customerId: string) {
    // Get all merchants involved in this order
    const order = await prisma.order.findUnique({
      where: { orderId },
      include: {
        items: {
          include: { product: true }
        }
      }
    });
    

   if (!order) {
      throw new Error('Order not found');
    }
    
    // Get unique merchant IDs and their amounts
    const merchantMap = new Map();
    
    for (const item of order.items) {
      const merchantId = item.product.merchantId;
      const itemAmount = item.price * item.quantity;
      const merchantShare = itemAmount * 0.4; // 40% to merchant
      
      if (merchantMap.has(merchantId)) {
        merchantMap.set(merchantId, merchantMap.get(merchantId) + merchantShare);
      } else {
        merchantMap.set(merchantId, merchantShare);
      }
    }
    
    // Create escrow record
    const escrow = await prisma.escrow.create({
      data: {
        orderId,
        amount,
        status: 'held',
        customerId,
      }
    });
    
  // Create escrow-merchant mappings and add pending credits
    for (const [merchantId, merchantAmount] of merchantMap) {
      // Create mapping
      await prisma.escrowMerchant.create({
        data: {
          escrowId: escrow.id,
          merchantId,
          amount: merchantAmount,
          status: 'pending',
          orderId,
        }
      });
      
      // Add pending credit to merchant wallet
      await MerchantWalletService.addPendingCredit(merchantId, orderId, merchantAmount);
    }
    
    console.log(`💰 Escrow held for order ${orderId}: ${amount} TZS`);
    return escrow;
  }
  
  // Release payment when order is completed
  static async releasePayment(orderId: string) {
    const escrow = await prisma.escrow.findUnique({
      where: { orderId },
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
    
    if (!escrow) throw new Error('Escrow not found');
    if (escrow.status !== 'held') throw new Error('Payment not in escrow');
    
    const totalAmount = escrow.amount;
    const driverAmount = totalAmount * 0.4;  // 40% to driver
    const platformAmount = totalAmount * 0.2; // 20% to platform
    // Merchant total is 40% already handled in pending credits
    
    // 1. Credit driver
    if (escrow.order.driverId) {
      await WalletService.credit(escrow.order.driverId, driverAmount);
      
      console.log(`🚚 Driver ${escrow.order.driverId} credited: ${driverAmount} TZS`);
    }
    
   // Get all escrow-merchant mappings
    const escrowMerchants = await prisma.escrowMerchant.findMany({
      where: { escrowId: escrow.id }
    });

    // 2. Release credits to merchants (convert pending to actual)
     for (const em of escrowMerchants) {
      await MerchantWalletService.releaseCredit(em.merchantId, orderId);
      
    
    // 3. Update escrow status
     // Update escrow-merchant status
      await prisma.escrowMerchant.update({
        where: { id: em.id },
        data: {
          status: 'released',
          releasedAt: new Date()
        }
      });
    }
    
    // 4. Update escrow status
    const updated = await prisma.escrow.update({
      where: { orderId },
      data: {
        status: 'released',
        releasedAt: new Date(),
        driverId: escrow.order.driverId
      }
    });
    
    console.log(`✅ Escrow released for order ${orderId}`);
    console.log(`   Driver: ${driverAmount} TZS`);
    console.log(`   Platform: ${platformAmount} TZS`);
    console.log(`   Merchants: ${escrowMerchants.reduce((sum, em) => sum + em.amount, 0)} TZS`);
    
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
            merchant: true
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
        merchantName: em.merchant.name,
        amount: em.amount,
        status: em.status
      }))
    };
  }
}