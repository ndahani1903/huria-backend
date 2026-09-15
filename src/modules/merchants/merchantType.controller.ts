// src/modules/merchants/merchantType.controller.ts
import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { MerchantTypeService } from './merchantType.service';
import { OperatingHoursService } from './operatingHours.service';
import { prisma } from '../../config/db';

export class MerchantTypeController {
  
  // Get merchant type (for dashboard routing)
  static async getMerchantType(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id },
        select: { 
          id: true,
          merchantType: true, 
          name: true, 
          businessName: true,
          preparationTime: true,
          cuisineType: true,
          isAcceptingOrders: true,
          rating: true
        }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      res.json({
        id: merchant.id,
        merchantType: merchant.merchantType,
        name: merchant.name,
        businessName: merchant.businessName,
        preparationTime: merchant.preparationTime,
        cuisineType: merchant.cuisineType,
        isAcceptingOrders: merchant.isAcceptingOrders,
        rating: merchant.rating
      });
    } catch (error: any) {
      console.error('Get merchant type error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Get merchant configuration (type-specific settings)
  static async getMerchantConfig(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      const config = await MerchantTypeService.getMerchantConfig(merchant.id);
      res.json(config);
    } catch (error: any) {
      console.error('Get merchant config error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Update restaurant settings
  static async updateRestaurantSettings(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      if (merchant.merchantType !== 'RESTAURANT') {
        return res.status(400).json({ error: 'Not a restaurant merchant' });
      }
      
      const { preparationTime, cuisineType, dietaryTags, isAcceptingOrders, maxDeliveryRadiusKm } = req.body;
      
      const updated = await MerchantTypeService.updateMerchantSettings(merchant.id, {
        preparationTime,
        cuisineType,
        dietaryTags,
        isAcceptingOrders,
        maxDeliveryRadiusKm
      });
      
      res.json({
        success: true,
        settings: {
          preparationTime: updated.preparationTime,
          cuisineType: updated.cuisineType,
          dietaryTags: updated.dietaryTags,
          isAcceptingOrders: updated.isAcceptingOrders,
          maxDeliveryRadiusKm: updated.maxDeliveryRadiusKm
        }
      });
    } catch (error: any) {
      console.error('Update restaurant settings error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Update supermarket settings
  static async updateSupermarketSettings(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      if (merchant.merchantType !== 'SUPERMARKET') {
        return res.status(400).json({ error: 'Not a supermarket merchant' });
      }
      
      const { hasBarcodeScanner, aisleCategories, isAcceptingOrders, maxDeliveryRadiusKm } = req.body;
      
      const updated = await MerchantTypeService.updateMerchantSettings(merchant.id, {
        hasBarcodeScanner,
        aisleCategories,
        isAcceptingOrders,
        maxDeliveryRadiusKm
      });
      
      res.json({
        success: true,
        settings: {
          hasBarcodeScanner: updated.hasBarcodeScanner,
          aisleCategories: updated.aisleCategories,
          isAcceptingOrders: updated.isAcceptingOrders,
          maxDeliveryRadiusKm: updated.maxDeliveryRadiusKm
        }
      });
    } catch (error: any) {
      console.error('Update supermarket settings error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Toggle order acceptance (for restaurants)
  static async toggleOrderAcceptance(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const { isAccepting } = req.body;
      
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      const updated = await MerchantTypeService.updateMerchantSettings(merchant.id, {
        isAcceptingOrders: isAccepting
      });
      
      res.json({
        success: true,
        isAcceptingOrders: updated.isAcceptingOrders
      });
    } catch (error: any) {
      console.error('Toggle order acceptance error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Update preparation time (for restaurants)
  static async updatePreparationTime(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const { minutes } = req.body;
      
      if (!minutes || minutes < 5 || minutes > 120) {
        return res.status(400).json({ error: 'Preparation time must be between 5 and 120 minutes' });
      }
      
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      const updated = await MerchantTypeService.updateMerchantSettings(merchant.id, {
        preparationTime: minutes
      });
      
      res.json({
        success: true,
        preparationTime: updated.preparationTime
      });
    } catch (error: any) {
      console.error('Update preparation time error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Get operating hours
  static async getOperatingHours(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      const hours = await OperatingHoursService.getHours(merchant.id);
      res.json(hours);
    } catch (error: any) {
      console.error('Get operating hours error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Update operating hours
  static async updateOperatingHours(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const { hours } = req.body;
      
      if (!hours || !Array.isArray(hours)) {
        return res.status(400).json({ error: 'Hours array required' });
      }
      
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      const updated = await OperatingHoursService.updateHours(merchant.id, hours);
      res.json({ success: true, hours: updated });
    } catch (error: any) {
      console.error('Update operating hours error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Get nearby merchants (for customer app)
  static async getNearbyMerchants(req: AuthRequest, res: Response) {
    try {
      const { lat, lng, type, radius, limit, isOpen } = req.query;
      
      if (!lat || !lng) {
        return res.status(400).json({ error: 'Latitude and longitude required' });
      }
      
      const merchants = await MerchantTypeService.getNearbyMerchants({
        userLat: parseFloat(lat as string),
        userLng: parseFloat(lng as string),
        type: type as any,
        radiusKm: radius ? parseFloat(radius as string) : 40,
        limit: limit ? parseInt(limit as string) : 50,
        isOpen: isOpen === 'true'
      });
      
      res.json(merchants);
    } catch (error: any) {
      console.error('Get nearby merchants error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Get merchant details for customer (menu view)
  static async getMerchantDetails(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { lat, lng } = req.query;
      
      const details = await MerchantTypeService.getMerchantDetails(
        id,
        lat ? parseFloat(lat as string) : undefined,
        lng ? parseFloat(lng as string) : undefined
      );
      
      if (!details) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      res.json(details);
    } catch (error: any) {
      console.error('Get merchant details error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
 static async getProductByBarcode(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { barcode } = req.params;
    
    console.log(`🔍 Looking for product with barcode: ${barcode}`);
    
    // First, get the merchant
    const merchant = await prisma.merchant.findUnique({
      where: { userId: req.user.id }
    });
    
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }
    
    // Find product by barcode for this merchant
    const product = await prisma.product.findFirst({
      where: {
        merchantId: merchant.id,
        barcode: barcode,
        isActive: true
      },
      include: { variants: true }
    });
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Return product with all fields
    res.json({
      id: product.id,
      name: product.name,
      price: Number(product.price),
      stock: product.stock,
      description: product.description,
      images: product.images,
      barcode: product.barcode,
      aisleLocation: product.aisleLocation,
      expiryDate: product.expiryDate,
      weight: product.weight,
      unit: product.unit,
      minimumOrderQuantity: product.minimumOrderQuantity,
      maximumOrderQuantity: product.maximumOrderQuantity,
      variants: product.variants,
      category: product.category
    });
    
  } catch (error: any) {
    console.error('Get product by barcode error:', error);
    res.status(500).json({ error: error.message });
  }
}
  
  // Get low stock alerts (supermarket)
  static async getLowStockAlerts(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      const { threshold } = req.query;
      const alerts = await MerchantTypeService.getLowStockAlerts(
        merchant.id,
        threshold ? parseInt(threshold as string) : 10
      );
      
      res.json(alerts);
    } catch (error: any) {
      console.error('Get low stock alerts error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Get expiring products (supermarket)
  static async getExpiringProducts(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      const { days } = req.query;
      const expiring = await MerchantTypeService.getExpiringProducts(
        merchant.id,
        days ? parseInt(days as string) : 7
      );
      
      res.json(expiring);
    } catch (error: any) {
      console.error('Get expiring products error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
// src/modules/merchants/merchantType.controller.ts

// Update merchant cover image
static async updateCoverImage(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { coverImage } = req.body;
    
    if (!coverImage) {
      return res.status(400).json({ error: 'Cover image URL is required' });
    }
    
    const merchant = await prisma.merchant.update({
      where: { userId: req.user.id },
      data: { coverImage }
    });
    
    res.json({ 
      success: true, 
      coverImage: merchant.coverImage 
    });
  } catch (error: any) {
    console.error('Update cover image error:', error);
    res.status(500).json({ error: error.message });
  }
}

// Update merchant logo
static async updateLogo(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { logoImage } = req.body;
    
    if (!logoImage) {
      return res.status(400).json({ error: 'Logo image URL is required' });
    }
    
    const merchant = await prisma.merchant.update({
      where: { userId: req.user.id },
      data: { logoImage }
    });
    
    res.json({ 
      success: true, 
      logoImage: merchant.logoImage 
    });
  } catch (error: any) {
    console.error('Update logo error:', error);
    res.status(500).json({ error: error.message });
  }
}

// Get merchant images (cover and logo)
static async getMerchantImages(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const merchant = await prisma.merchant.findUnique({
      where: { userId: req.user.id },
      select: { coverImage: true, logoImage: true, name: true, businessName: true }
    });
    
    if (!merchant) {
      return res.status(404).json({ error: 'Merchant not found' });
    }
    
    res.json({
      coverImage: merchant.coverImage,
      logoImage: merchant.logoImage,
      name: merchant.name,
      businessName: merchant.businessName
    });
  } catch (error: any) {
    console.error('Get merchant images error:', error);
    res.status(500).json({ error: error.message });
  }
}

// src/modules/merchants/merchantType.controller.ts

// Add store review
static async addStoreReview(req: AuthRequest, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    const { merchantId } = req.params;
    const { rating, comment } = req.body;
    
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }
    
    // Check if user already reviewed this store
    const existingReview = await prisma.storeReview.findUnique({
      where: {
        merchantId_userId: {
          merchantId,
          userId: req.user.id
        }
      }
    });
    
    if (existingReview) {
      return res.status(400).json({ error: 'You have already reviewed this store' });
    }
    
    const review = await prisma.storeReview.create({
      data: {
        merchantId,
        userId: req.user.id,
        rating,
        comment: comment || null
      }
    });
    
    // Update merchant average rating
    const avgRating = await prisma.storeReview.aggregate({
      where: { merchantId },
      _avg: { rating: true }
    });
    
    await prisma.merchant.update({
      where: { id: merchantId },
      data: { rating: avgRating._avg.rating || 0 }
    });
    
    res.json({ success: true, review });
  } catch (error: any) {
    console.error('Add store review error:', error);
    res.status(500).json({ error: error.message });
  }
}

// Get store reviews
static async getStoreReviews(req: AuthRequest, res: Response) {
  try {
    const { merchantId } = req.params;
    
    const reviews = await prisma.storeReview.findMany({
      where: { merchantId },
      include: {
        user: {
          select: { name: true, avatar: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    const avgRating = await prisma.storeReview.aggregate({
      where: { merchantId },
      _avg: { rating: true },
      _count: true
    });
    
    res.json({
      reviews,
      averageRating: avgRating._avg.rating || 0,
      totalReviews: avgRating._count
    });
  } catch (error: any) {
    console.error('Get store reviews error:', error);
    res.status(500).json({ error: error.message });
  }
}

  // Update stock (supermarket)
  static async updateStock(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const { productId } = req.params;
      const { stock, reason } = req.body;
      
      if (stock === undefined || stock < 0) {
        return res.status(400).json({ error: 'Valid stock quantity required' });
      }
      
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      const updated = await MerchantTypeService.updateStock(merchant.id, productId, stock, reason);
      
      res.json({ success: true, product: updated });
    } catch (error: any) {
      console.error('Update stock error:', error);
      res.status(500).json({ error: error.message });
    }
  }
}