// src/modules/merchants/merchantType.service.ts
import { prisma } from '../../config/db';
import { MerchantType } from '@prisma/client';
import { calculateHaversineDistance, Coordinates } from '../../utils/distance.utils';

export interface NearbyMerchantParams {
  userLat: number;
  userLng: number;
  type?: MerchantType;
  radiusKm?: number;
  limit?: number;
  isOpen?: boolean;
}

export interface NearbyMerchantResult {
  id: string;
  name: string;
  businessName: string | null;
  merchantType: MerchantType;
  distanceKm: number;
  distanceCategory: 'NEAR_YOU' | 'AWAY' | 'TOO_FAR';
  isOrderable: boolean;
  estimatedDeliveryMinutes: number;
  rating: number;
  totalReviews: number;
  isAcceptingOrders: boolean;
  preparationTime?: number | null;
  cuisineType?: string | null;
  imageUrl?: string;
  operatingHours?: any;
}

export class MerchantTypeService {
  
  // Get merchant type configuration
  static async getMerchantConfig(merchantId: string) {
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: {
        merchantType: true,
        preparationTime: true,
        cuisineType: true,
        dietaryTags: true,
        hasBarcodeScanner: true,
        aisleCategories: true,
        operatingHours: true,
        pickupLat: true,
        pickupLng: true,
        maxDeliveryRadiusKm: true,
        isAcceptingOrders: true,
        businessName: true,
        name: true,
        phone: true
      }
    });
    
    return merchant;
  }
  
  // Get nearby merchants by type (for customer app)
  static async getNearbyMerchants(params: NearbyMerchantParams): Promise<NearbyMerchantResult[]> {
    const {
      userLat,
      userLng,
      type,
      radiusKm = 40,
      limit = 50,
      isOpen = false
    } = params;

  console.log(`🔍 getNearbyMerchants called with:`, { userLat, userLng, type, radiusKm, isOpen });
    
    const userCoords: Coordinates = { lat: userLat, lng: userLng };

   const where: any = {};
    if (type) {
      where.merchantType = type;
    }

    console.log(`📊 Query where clause:`, where);
    
    // If filtering by open, we'll filter after fetching
    const merchants = await prisma.merchant.findMany({
      where,
      select: {
        id: true,
        name: true,
        businessName: true,
        merchantType: true,
        pickupLat: true,
        pickupLng: true,
        rating: true,
        totalSales: true,
        isAcceptingOrders: true,
        preparationTime: true,
        cuisineType: true,
        dietaryTags: true,
        operatingHours: true,
        pickupAddress: true,
        coverImage: true,
        logoImage: true
      }
    });

    // Calculate distance and filter
    const results: NearbyMerchantResult[] = [];
    
    for (const merchant of merchants) {
      const merchantLat = merchant.pickupLat;
      const merchantLng = merchant.pickupLng;
      
       if (!merchantLat || !merchantLng) continue;
      
      const distance = calculateHaversineDistance(userCoords, { lat: merchantLat, lng: merchantLng });
      
      // Filter by radius
      if (distance > radiusKm) continue;
    
     // ✅ Get actual review count
    const reviewCount = await prisma.storeReview.count({
      where: { merchantId: merchant.id }
    });
      
      // Determine distance category
      let distanceCategory: 'NEAR_YOU' | 'AWAY' | 'TOO_FAR' = 'NEAR_YOU';
      let isOrderable = true;
      let estimatedDeliveryMinutes = 30;
      
      if (distance <= 5) {
        distanceCategory = 'NEAR_YOU';
        estimatedDeliveryMinutes = 20 + Math.floor(distance * 2);
      } else if (distance > 5 && distance <= 10) {
        distanceCategory = 'NEAR_YOU';
        estimatedDeliveryMinutes = 30 + Math.floor(distance * 1.5);
      } else if (distance > 10 && distance <= 20) {
        distanceCategory = 'AWAY';
        estimatedDeliveryMinutes = 45 + Math.floor(distance * 1.2);
      } else if (distance > 20 && distance <= 40) {
        distanceCategory = 'AWAY';
        estimatedDeliveryMinutes = 60 + Math.floor(distance * 1);
      } else {
        distanceCategory = 'TOO_FAR';
        isOrderable = false;
        estimatedDeliveryMinutes = 999;
      }
      
      // Check if store is open
      let isStoreOpen = true;
      if (isOpen && merchant.operatingHours) {
        isStoreOpen = this.isStoreOpen(merchant.operatingHours as any);
        if (!isStoreOpen) {
          isOrderable = false;
        }
      }
      
      // Override with merchant's own prep time
      if (merchant.preparationTime) {
        estimatedDeliveryMinutes = merchant.preparationTime + Math.floor(distance * 2);
      }
      
      results.push({
        id: merchant.id,
        name: merchant.name,
        businessName: merchant.businessName,
        merchantType: merchant.merchantType,
        distanceKm: parseFloat(distance.toFixed(1)),
        distanceCategory,
        isOrderable: isOrderable && merchant.isAcceptingOrders,
        estimatedDeliveryMinutes,
        rating: merchant.rating || 0,
        totalReviews: reviewCount,
        isAcceptingOrders: merchant.isAcceptingOrders,
        preparationTime: merchant.preparationTime,
        cuisineType: merchant.cuisineType,
        imageUrl:  merchant.coverImage, 
        operatingHours: merchant.operatingHours
      });
    }
    
    // Sort by distance
    results.sort((a, b) => a.distanceKm - b.distanceKm);
 
    return results.slice(0, limit);
  }
  
  // Check if store is open based on operating hours
  private static isStoreOpen(operatingHours: any): boolean {
    if (!operatingHours) return true;
    
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Sunday
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    // If operating hours is an array
    if (Array.isArray(operatingHours)) {
      const todayHours = operatingHours.find((h: any) => h.dayOfWeek === currentDay);
      if (!todayHours || todayHours.isClosed) return false;
      
      const [openHour, openMinute] = (todayHours.opensAt || '00:00').split(':').map(Number);
      const [closeHour, closeMinute] = (todayHours.closesAt || '23:59').split(':').map(Number);
      
      const openTime = openHour * 60 + openMinute;
      const closeTime = closeHour * 60 + closeMinute;
      
      return currentTime >= openTime && currentTime <= closeTime;
    }
    
    return true;
  }
  
  // Get merchant details for customer (menu view)
  static async getMerchantDetails(merchantId: string, customerLat?: number, customerLng?: number) {
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      include: {
        products: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' }
        },
        storeReviews: {
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { name: true } } }
        }
      }
    });
    
    if (!merchant) return null;
    
   // ✅ Calculate average rating from reviews
  const ratingAggregate = await prisma.storeReview.aggregate({
    where: { merchantId },
    _avg: { rating: true },
    _count: true
  });
  
  const averageRating = ratingAggregate._avg.rating || merchant.rating || 0;
  const totalReviews = ratingAggregate._count;


    let distanceKm = null;
    let isOrderable = true;
    
    if (customerLat && customerLng && merchant.pickupLat && merchant.pickupLng) {
    distanceKm = calculateHaversineDistance(
      { lat: customerLat, lng: customerLng },
      { lat: merchant.pickupLat, lng: merchant.pickupLng }
    );
        
        const maxRadius = merchant.maxDeliveryRadiusKm || 40;
        isOrderable = distanceKm <= maxRadius;
      } else if (!merchant.pickupLat || !merchant.pickupLng) {
    // Merchant has no location set
    isOrderable = false;
  }
    
    return {
      id: merchant.id,
      name: merchant.name,
      businessName: merchant.businessName,
      merchantType: merchant.merchantType,
      coverImage: merchant.coverImage,
      pickupAddress: merchant.pickupAddress,
      pickupLat: merchant.pickupLat,
      pickupLng: merchant.pickupLng,
      phone: merchant.phone,
      rating: averageRating,
      totalReviews: totalReviews,
      isAcceptingOrders: merchant.isAcceptingOrders,
      preparationTime: merchant.preparationTime,
      cuisineType: merchant.cuisineType,
      dietaryTags: merchant.dietaryTags,
      operatingHours: merchant.operatingHours,
      distanceKm: distanceKm ? parseFloat(distanceKm.toFixed(1)) : null,
      isOrderable,
      reviews: merchant.storeReviews.map(review => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      userName: review.user?.name || 'Anonymous',
      userAvatar: review.user?.avatar,
      createdAt: review.createdAt
    })),
      products: merchant.products.map(p => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        description: p.description,
        images: p.images,
        category: p.category,
        isAvailable: p.isAvailable,
        preparationTime: p.preparationTime,
        dietaryInfo: p.dietaryInfo,
        isSpicy: p.isSpicy,
        isVegetarian: p.isVegetarian,
        isVegan: p.isVegan,
        isGlutenFree: p.isGlutenFree,
        modifiers: p.modifiers,
        // Supermarket specific
        barcode: p.barcode,
        unit: p.unit,
        weight: p.weight,
        stock: p.stock,
        minimumOrderQuantity: p.minimumOrderQuantity
      }))
    };
  }
  
  // Update merchant type settings
  static async updateMerchantSettings(
    merchantId: string,
    updates: {
      preparationTime?: number;
      cuisineType?: string;
      dietaryTags?: string[];
      isAcceptingOrders?: boolean;
      maxDeliveryRadiusKm?: number;
      hasBarcodeScanner?: boolean;
      aisleCategories?: string[];
      operatingHours?: any;
    }
  ) {
    const merchant = await prisma.merchant.update({
      where: { id: merchantId },
      data: {
        preparationTime: updates.preparationTime,
        cuisineType: updates.cuisineType,
        dietaryTags: updates.dietaryTags,
        isAcceptingOrders: updates.isAcceptingOrders,
        maxDeliveryRadiusKm: updates.maxDeliveryRadiusKm,
        hasBarcodeScanner: updates.hasBarcodeScanner,
        aisleCategories: updates.aisleCategories,
        operatingHours: updates.operatingHours
      }
    });
    
    return merchant;
  }
  
  // Get products by type with filtering
  static async getProductsByType(
    merchantId: string,
    type: MerchantType,
    filters?: {
      category?: string;
      dietary?: string[];
      minPrice?: number;
      maxPrice?: number;
      isAvailable?: boolean;
    }
  ) {
    const where: any = { merchantId, isActive: true };
    
    if (filters) {
      if (filters.category) where.category = filters.category;
      if (filters.isAvailable !== undefined) where.isAvailable = filters.isAvailable;
      if (filters.minPrice) where.price = { gte: filters.minPrice };
      if (filters.maxPrice) where.price = { ...where.price, lte: filters.maxPrice };
      
      if (type === 'RESTAURANT' && filters.dietary?.length) {
        where.dietaryInfo = { hasSome: filters.dietary };
      }
    }
    
    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { variants: true }
    });
    
    return products.map(p => ({
      ...p,
      price: Number(p.price)
    }));
  }
  
  // Get supermarket low stock alerts
  static async getLowStockAlerts(merchantId: string, threshold = 10) {
    const products = await prisma.product.findMany({
      where: {
        merchantId,
        stock: { lt: threshold },
        isActive: true
      },
      orderBy: { stock: 'asc' }
    });
    
    return products.map(p => ({
      id: p.id,
      name: p.name,
      stock: p.stock,
      price: Number(p.price),
      barcode: p.barcode,
      aisleLocation: p.aisleLocation,
      minimumOrderQuantity: p.minimumOrderQuantity
    }));
  }
  
  // Get expiring products for supermarket
  static async getExpiringProducts(merchantId: string, daysThreshold = 7) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + daysThreshold);
    
    const products = await prisma.product.findMany({
      where: {
        merchantId,
        expiryDate: { lte: expiryDate, not: null },
        isActive: true
      },
      orderBy: { expiryDate: 'asc' }
    });
    
    return products.map(p => ({
      id: p.id,
      name: p.name,
      expiryDate: p.expiryDate,
      daysUntilExpiry: p.expiryDate 
        ? Math.ceil((p.expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null,
      stock: p.stock,
      price: Number(p.price),
      barcode: p.barcode
    }));
  }
  
  // Get product by barcode (supermarket scanner)
  static async getProductByBarcode(merchantId: string, barcode: string) {
    const product = await prisma.product.findFirst({
      where: {
        merchantId,
        barcode,
        isActive: true
      },
      include: { variants: true }
    });
    
    if (!product) return null;
    
    return {
      ...product,
      price: Number(product.price)
    };
  }
  
  // Update stock for supermarket item
  static async updateStock(merchantId: string, productId: string, newStock: number, reason?: string) {
    // Verify product belongs to merchant
    const product = await prisma.product.findFirst({
      where: { id: productId, merchantId }
    });
    
    if (!product) {
      throw new Error('Product not found or unauthorized');
    }
    
    const oldStock = product.stock;
    
    const updated = await prisma.product.update({
      where: { id: productId },
      data: { stock: newStock }
    });
    
    // Create audit log for stock change
    await prisma.auditLog.create({
      data: {
        adminId: merchantId,
        action: 'STOCK_UPDATE',
        targetType: 'product',
        targetId: productId,
        meta: { oldStock, newStock, reason },
        severity: 'info'
      }
    });
    
    // If stock is low, could trigger notification
    if (newStock < 10 && newStock !== oldStock) {
      // Could emit socket event for low stock alert
    }
    
    return updated;
  }
}