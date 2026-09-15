// src/controllers/logistics.controller.ts

import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { LogisticsService } from '../services/logistics.service';
import { MerchantLogisticsService } from '../services/merchantLogistics.service';
import { CartItemLogistics } from '../types/logistics.types';
import { prisma } from '../config/db';

export class LogisticsController {
  
  /**
   * Evaluate cart logistics (public endpoint)
   * Used during checkout to determine shipping mode and fee
   */

static async evaluateCart(req: AuthRequest, res: Response) {
  try {
    const { cartItems, customerLat, customerLng, hour = new Date().getHours(), isRaining = false } = req.body;
    
    if (!cartItems || cartItems.length === 0) {
      return res.status(400).json({ error: 'Cart is empty' });
    }
    
    if (!customerLat || !customerLng) {
      return res.status(400).json({ error: 'Customer location required' });
    }
    
    // ✅ FIX: Get product logistics info for all items in cart
    const productIds = cartItems.map((item: any) => item.productId);
    const productsInfo = await LogisticsService.getBatchLogisticsInfo(productIds);
    
    // Check if all products are from same merchant
    const uniqueMerchants = [...new Set(productsInfo.map(p => p.merchantId))];
    
    if (uniqueMerchants.length !== 1) {
      return res.status(400).json({ 
        error: 'Cart contains items from multiple merchants. Please checkout each merchant separately.' 
      });
    }
    
    const merchantInfo = productsInfo[0];
    if (!merchantInfo.merchantLocation) {
      return res.status(400).json({ error: 'Merchant pickup location not configured' });
    }
    
    // Build cart items with logistics data
    const cartItemsWithLogistics: CartItemLogistics[] = cartItems.map((item: any) => {
      const productInfo = productsInfo.find(p => p.productId === item.productId);
      return {
        productId: item.productId,
        quantity: item.quantity,
        weightBracket: productInfo?.weightBracket || 'LIGHT',
        allowedVehicles: productInfo?.allowedVehicles || ['motorcycle', 'bajaj', 'truck']
      };
    });
    
    // ✅ Call the service (NOT duplicate logic)
    const result = LogisticsService.evaluateCartLogistics(
      cartItemsWithLogistics,
      merchantInfo.merchantLocation,
      { lat: customerLat, lng: customerLng },
      { hour, isRaining }
    );
    
    res.json({
      success: true,
      ...result,
      merchantId: uniqueMerchants[0],
      merchantName: merchantInfo.merchant?.businessName
    });
    
  } catch (error: any) {
    console.error('Evaluate cart error:', error);
    res.status(500).json({ error: error.message });
  }
}
  
  /**
   * Update product logistics (merchant only)
   */
  static async updateProductLogistics(req: AuthRequest, res: Response) {
    try {
      const { productId } = req.params;
      const { weightBracket, allowedVehicles } = req.body;

    console.log("📦 Updating product logistics:", { productId, weightBracket, allowedVehicles });
    console.log("👤 User from token:", req.user);

      // ✅ FIX: Get merchant by userId (not merchantId from token)
    const merchant = await prisma.merchant.findUnique({
      where: { userId: req.user.id }
    });
    
    if (!merchant) {
      console.log("❌ Merchant not found for userId:", req.user.id);
      return res.status(404).json({ error: 'Merchant not found' });
    }
    
    console.log("🏪 Found merchant:", merchant.id);
    
    
      // ✅ Use the service, not duplicate logic
    const updated = await MerchantLogisticsService.updateProductLogistics(
      productId,
      merchant.id,
      { weightBracket, allowedVehicles }
    );
      
     console.log("✅ Product logistics updated:", updated.id);
    res.json({ success: true, product: updated });
      
    } catch (error: any) {
      console.error('Update product logistics error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  /**
   * Get merchant's FBU requests
   */
  static async getMerchantFBURequests(req: AuthRequest, res: Response) {
    try {
      // ✅ FIX: Get merchant by userId, not merchantId from token
    const merchant = await prisma.merchant.findUnique({
      where: { userId: req.user.id }
    });
      
       if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }
      
      // ✅ Call the service correctly (pass merchant.id, not merchant object)
    const requests = await MerchantLogisticsService.getMerchantFBURequests(merchant.id);
    res.json(requests);
      
    } catch (error: any) {
      console.error('Get merchant FBU requests error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  /**
   * Merchant confirms pickup schedule
   */
  static async confirmPickupSchedule(req: AuthRequest, res: Response) {
    try {
      const { requestId } = req.params;
      const { scheduledAt } = req.body;
      
    // Get merchant by userId
    const merchant = await prisma.merchant.findUnique({
      where: { userId: req.user.id }
    });
    
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }
      
      const updated = await MerchantLogisticsService.merchantConfirmPickupSchedule(
        merchant.id,
        requestId,
        new Date(scheduledAt)
      );
      
      res.json({ success: true, request: updated });
      
    } catch (error: any) {
      console.error('Confirm pickup schedule error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  /**
   * Get weight bracket from actual weight (helper for merchant)
   */
  static async getWeightBracket(req: Request, res: Response) {
    try {
      const { weightKg } = req.query;
      
      if (!weightKg) {
        return res.status(400).json({ error: 'weightKg query param required' });
      }
      
      const bracket = MerchantLogisticsService.getWeightBracketFromWeight(Number(weightKg));
      res.json({ weightKg: Number(weightKg), bracket });
      
    } catch (error: any) {
      console.error('Get weight bracket error:', error);
      res.status(500).json({ error: error.message });
    }
  }
}

