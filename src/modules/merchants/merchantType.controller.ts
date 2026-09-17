// src/modules/merchants/merchantType.controller.ts

import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { MerchantTypeService } from './merchantType.service';
import { OperatingHoursService } from './operatingHours.service';
import { prisma } from '../../config/db';

export class MerchantTypeController {

  /**
   * Express route params can be typed as string | string[]
   * depending on the installed Express type definitions.
   *
   * This helper guarantees that a route parameter is a string.
   */
  private static getParam(
    value: string | string[] | undefined,
    name: string
  ): string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`${name} is required`);
    }

    return value.trim();
  }

  // ============================================================
  // MERCHANT TYPE
  // ============================================================

  // Get merchant type (for dashboard routing)
  static async getMerchantType(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized'
        });
      }

      const merchant =
        await prisma.merchant.findUnique({
          where: {
            userId: req.user.id
          },
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
        return res.status(404).json({
          error: 'Merchant not found'
        });
      }

      return res.json({
        id: merchant.id,
        merchantType: merchant.merchantType,
        name: merchant.name,
        businessName: merchant.businessName,
        preparationTime: merchant.preparationTime,
        cuisineType: merchant.cuisineType,
        isAcceptingOrders:
          merchant.isAcceptingOrders,
        rating: merchant.rating
      });
    } catch (error: any) {
      console.error(
        'Get merchant type error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // MERCHANT CONFIGURATION
  // ============================================================

  // Get merchant configuration
  static async getMerchantConfig(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized'
        });
      }

      const merchant =
        await prisma.merchant.findUnique({
          where: {
            userId: req.user.id
          }
        });

      if (!merchant) {
        return res.status(404).json({
          error: 'Merchant not found'
        });
      }

      const config =
        await MerchantTypeService.getMerchantConfig(
          merchant.id
        );

      return res.json(config);
    } catch (error: any) {
      console.error(
        'Get merchant config error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // RESTAURANT SETTINGS
  // ============================================================

  // Update restaurant settings
  static async updateRestaurantSettings(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized'
        });
      }

      const merchant =
        await prisma.merchant.findUnique({
          where: {
            userId: req.user.id
          }
        });

      if (!merchant) {
        return res.status(404).json({
          error: 'Merchant not found'
        });
      }

      if (
        merchant.merchantType !==
        'RESTAURANT'
      ) {
        return res.status(400).json({
          error:
            'Not a restaurant merchant'
        });
      }

      const {
        preparationTime,
        cuisineType,
        dietaryTags,
        isAcceptingOrders,
        maxDeliveryRadiusKm
      } = req.body;

      const updated =
        await MerchantTypeService.updateMerchantSettings(
          merchant.id,
          {
            preparationTime,
            cuisineType,
            dietaryTags,
            isAcceptingOrders,
            maxDeliveryRadiusKm
          }
        );

      return res.json({
        success: true,
        settings: {
          preparationTime:
            updated.preparationTime,
          cuisineType:
            updated.cuisineType,
          dietaryTags:
            updated.dietaryTags,
          isAcceptingOrders:
            updated.isAcceptingOrders,
          maxDeliveryRadiusKm:
            updated.maxDeliveryRadiusKm
        }
      });
    } catch (error: any) {
      console.error(
        'Update restaurant settings error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // SUPERMARKET SETTINGS
  // ============================================================

  // Update supermarket settings
  static async updateSupermarketSettings(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized'
        });
      }

      const merchant =
        await prisma.merchant.findUnique({
          where: {
            userId: req.user.id
          }
        });

      if (!merchant) {
        return res.status(404).json({
          error: 'Merchant not found'
        });
      }

      if (
        merchant.merchantType !==
        'SUPERMARKET'
      ) {
        return res.status(400).json({
          error:
            'Not a supermarket merchant'
        });
      }

      const {
        hasBarcodeScanner,
        aisleCategories,
        isAcceptingOrders,
        maxDeliveryRadiusKm
      } = req.body;

      const updated =
        await MerchantTypeService.updateMerchantSettings(
          merchant.id,
          {
            hasBarcodeScanner,
            aisleCategories,
            isAcceptingOrders,
            maxDeliveryRadiusKm
          }
        );

      return res.json({
        success: true,
        settings: {
          hasBarcodeScanner:
            updated.hasBarcodeScanner,
          aisleCategories:
            updated.aisleCategories,
          isAcceptingOrders:
            updated.isAcceptingOrders,
          maxDeliveryRadiusKm:
            updated.maxDeliveryRadiusKm
        }
      });
    } catch (error: any) {
      console.error(
        'Update supermarket settings error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // ORDER ACCEPTANCE
  // ============================================================

  // Toggle order acceptance
  static async toggleOrderAcceptance(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized'
        });
      }

      const {
        isAccepting
      } = req.body;

      const merchant =
        await prisma.merchant.findUnique({
          where: {
            userId: req.user.id
          }
        });

      if (!merchant) {
        return res.status(404).json({
          error: 'Merchant not found'
        });
      }

      const updated =
        await MerchantTypeService.updateMerchantSettings(
          merchant.id,
          {
            isAcceptingOrders:
              isAccepting
          }
        );

      return res.json({
        success: true,
        isAcceptingOrders:
          updated.isAcceptingOrders
      });
    } catch (error: any) {
      console.error(
        'Toggle order acceptance error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // PREPARATION TIME
  // ============================================================

  // Update preparation time
  static async updatePreparationTime(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized'
        });
      }

      const {
        minutes
      } = req.body;

      if (
        !minutes ||
        minutes < 5 ||
        minutes > 120
      ) {
        return res.status(400).json({
          error:
            'Preparation time must be between 5 and 120 minutes'
        });
      }

      const merchant =
        await prisma.merchant.findUnique({
          where: {
            userId: req.user.id
          }
        });

      if (!merchant) {
        return res.status(404).json({
          error: 'Merchant not found'
        });
      }

      const updated =
        await MerchantTypeService.updateMerchantSettings(
          merchant.id,
          {
            preparationTime: minutes
          }
        );

      return res.json({
        success: true,
        preparationTime:
          updated.preparationTime
      });
    } catch (error: any) {
      console.error(
        'Update preparation time error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // OPERATING HOURS
  // ============================================================

  // Get operating hours
  static async getOperatingHours(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized'
        });
      }

      const merchant =
        await prisma.merchant.findUnique({
          where: {
            userId: req.user.id
          }
        });

      if (!merchant) {
        return res.status(404).json({
          error: 'Merchant not found'
        });
      }

      const hours =
        await OperatingHoursService.getHours(
          merchant.id
        );

      return res.json(hours);
    } catch (error: any) {
      console.error(
        'Get operating hours error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // Update operating hours
  static async updateOperatingHours(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized'
        });
      }

      const {
        hours
      } = req.body;

      if (
        !hours ||
        !Array.isArray(hours)
      ) {
        return res.status(400).json({
          error: 'Hours array required'
        });
      }

      const merchant =
        await prisma.merchant.findUnique({
          where: {
            userId: req.user.id
          }
        });

      if (!merchant) {
        return res.status(404).json({
          error: 'Merchant not found'
        });
      }

      const updated =
        await OperatingHoursService.updateHours(
          merchant.id,
          hours
        );

      return res.json({
        success: true,
        hours: updated
      });
    } catch (error: any) {
      console.error(
        'Update operating hours error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // NEARBY MERCHANTS
  // ============================================================

  // Get nearby merchants
  static async getNearbyMerchants(
    req: AuthRequest,
    res: Response
  ) {
    try {
      const {
        lat,
        lng,
        type,
        radius,
        limit,
        isOpen
      } = req.query;

      if (!lat || !lng) {
        return res.status(400).json({
          error:
            'Latitude and longitude required'
        });
      }

      const merchants =
        await MerchantTypeService.getNearbyMerchants({
          userLat: parseFloat(
            lat as string
          ),
          userLng: parseFloat(
            lng as string
          ),
          type: type as any,
          radiusKm: radius
            ? parseFloat(
                radius as string
              )
            : 40,
          limit: limit
            ? parseInt(
                limit as string,
                10
              )
            : 50,
          isOpen:
            isOpen === 'true'
        });

      return res.json(merchants);
    } catch (error: any) {
      console.error(
        'Get nearby merchants error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // MERCHANT DETAILS
  // ============================================================

  // Get merchant details for customer
  static async getMerchantDetails(
    req: AuthRequest,
    res: Response
  ) {
    try {
      const id =
        MerchantTypeController.getParam(
          req.params.id,
          'Merchant ID'
        );

      const {
        lat,
        lng
      } = req.query;

      const details =
        await MerchantTypeService.getMerchantDetails(
          id,
          lat
            ? parseFloat(
                lat as string
              )
            : undefined,
          lng
            ? parseFloat(
                lng as string
              )
            : undefined
        );

      if (!details) {
        return res.status(404).json({
          error: 'Merchant not found'
        });
      }

      return res.json(details);
    } catch (error: any) {
      console.error(
        'Get merchant details error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // PRODUCT BY BARCODE
  // ============================================================

  static async getProductByBarcode(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized'
        });
      }

      const barcode =
        MerchantTypeController.getParam(
          req.params.barcode,
          'Barcode'
        );

      console.log(
        `🔍 Looking for product with barcode: ${barcode}`
      );

      // First, get the merchant
      const merchant =
        await prisma.merchant.findUnique({
          where: {
            userId: req.user.id
          }
        });

      if (!merchant) {
        return res.status(404).json({
          error: 'Merchant not found'
        });
      }

      // Find product by barcode for this merchant.
      //
      // variants is explicitly included because the
      // response below returns product.variants.
      const product =
        await prisma.product.findFirst({
          where: {
            merchantId: merchant.id,
            barcode,
            isActive: true
          },
          include: {
            variants: true
          }
        });

      if (!product) {
        return res.status(404).json({
          error: 'Product not found'
        });
      }

      return res.json({
        id: product.id,
        name: product.name,
        price: Number(product.price),
        stock: product.stock,
        description: product.description,
        images: product.images,
        barcode: product.barcode,
        aisleLocation:
          product.aisleLocation,
        expiryDate:
          product.expiryDate,
        weight: product.weight,
        unit: product.unit,
        minimumOrderQuantity:
          product.minimumOrderQuantity,
        maximumOrderQuantity:
          product.maximumOrderQuantity,
        variants: product.variants,
        category: product.category
      });
    } catch (error: any) {
      console.error(
        'Get product by barcode error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // LOW STOCK
  // ============================================================

  // Get low stock alerts
  static async getLowStockAlerts(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized'
        });
      }

      const merchant =
        await prisma.merchant.findUnique({
          where: {
            userId: req.user.id
          }
        });

      if (!merchant) {
        return res.status(404).json({
          error: 'Merchant not found'
        });
      }

      const {
        threshold
      } = req.query;

      const alerts =
        await MerchantTypeService.getLowStockAlerts(
          merchant.id,
          threshold
            ? parseInt(
                threshold as string,
                10
              )
            : 10
        );

      return res.json(alerts);
    } catch (error: any) {
      console.error(
        'Get low stock alerts error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // EXPIRING PRODUCTS
  // ============================================================

  // Get expiring products
  static async getExpiringProducts(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized'
        });
      }

      const merchant =
        await prisma.merchant.findUnique({
          where: {
            userId: req.user.id
          }
        });

      if (!merchant) {
        return res.status(404).json({
          error: 'Merchant not found'
        });
      }

      const {
        days
      } = req.query;

      const expiring =
        await MerchantTypeService.getExpiringProducts(
          merchant.id,
          days
            ? parseInt(
                days as string,
                10
              )
            : 7
        );

      return res.json(expiring);
    } catch (error: any) {
      console.error(
        'Get expiring products error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // MERCHANT IMAGES
  // ============================================================

  // Update merchant cover image
  static async updateCoverImage(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized'
        });
      }

      const {
        coverImage
      } = req.body;

      if (!coverImage) {
        return res.status(400).json({
          error:
            'Cover image URL is required'
        });
      }

      const merchant =
        await prisma.merchant.update({
          where: {
            userId: req.user.id
          },
          data: {
            coverImage
          }
        });

      return res.json({
        success: true,
        coverImage:
          merchant.coverImage
      });
    } catch (error: any) {
      console.error(
        'Update cover image error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // Update merchant logo
  static async updateLogo(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized'
        });
      }

      const {
        logoImage
      } = req.body;

      if (!logoImage) {
        return res.status(400).json({
          error:
            'Logo image URL is required'
        });
      }

      const merchant =
        await prisma.merchant.update({
          where: {
            userId: req.user.id
          },
          data: {
            logoImage
          }
        });

      return res.json({
        success: true,
        logoImage:
          merchant.logoImage
      });
    } catch (error: any) {
      console.error(
        'Update logo error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // Get merchant images
  static async getMerchantImages(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized'
        });
      }

      const merchant =
        await prisma.merchant.findUnique({
          where: {
            userId: req.user.id
          },
          select: {
            coverImage: true,
            logoImage: true,
            name: true,
            businessName: true
          }
        });

      if (!merchant) {
        return res.status(404).json({
          error: 'Merchant not found'
        });
      }

      return res.json({
        coverImage:
          merchant.coverImage,
        logoImage:
          merchant.logoImage,
        name: merchant.name,
        businessName:
          merchant.businessName
      });
    } catch (error: any) {
      console.error(
        'Get merchant images error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // STORE REVIEWS
  // ============================================================

  // Add store review
  static async addStoreReview(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized'
        });
      }

      const merchantId =
        MerchantTypeController.getParam(
          req.params.merchantId,
          'Merchant ID'
        );

      const {
        rating,
        comment
      } = req.body;

      if (
        !rating ||
        rating < 1 ||
        rating > 5
      ) {
        return res.status(400).json({
          error:
            'Rating must be between 1 and 5'
        });
      }

      // Check if user already reviewed this store
      const existingReview =
        await prisma.storeReview.findUnique({
          where: {
            merchantId_userId: {
              merchantId,
              userId: req.user.id
            }
          }
        });

      if (existingReview) {
        return res.status(400).json({
          error:
            'You have already reviewed this store'
        });
      }

      const review =
        await prisma.storeReview.create({
          data: {
            merchantId,
            userId: req.user.id,
            rating,
            comment: comment || null
          }
        });

      // Update merchant average rating
      const avgRating =
        await prisma.storeReview.aggregate({
          where: {
            merchantId
          },
          _avg: {
            rating: true
          }
        });

      await prisma.merchant.update({
        where: {
          id: merchantId
        },
        data: {
          rating:
            avgRating._avg.rating || 0
        }
      });

      return res.json({
        success: true,
        review
      });
    } catch (error: any) {
      console.error(
        'Add store review error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // Get store reviews
  static async getStoreReviews(
    req: AuthRequest,
    res: Response
  ) {
    try {
      const merchantId =
        MerchantTypeController.getParam(
          req.params.merchantId,
          'Merchant ID'
        );

      const reviews =
        await prisma.storeReview.findMany({
          where: {
            merchantId
          },
          include: {
            user: {
              // Only select fields that exist in
              // the current Prisma User type.
              select: {
                name: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        });

      const avgRating =
        await prisma.storeReview.aggregate({
          where: {
            merchantId
          },
          _avg: {
            rating: true
          },
          _count: true
        });

      return res.json({
        reviews,
        averageRating:
          avgRating._avg.rating || 0,
        totalReviews:
          avgRating._count
      });
    } catch (error: any) {
      console.error(
        'Get store reviews error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // STOCK
  // ============================================================

  // Update stock
  static async updateStock(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Unauthorized'
        });
      }

      const productId =
        MerchantTypeController.getParam(
          req.params.productId,
          'Product ID'
        );

      const {
        stock,
        reason
      } = req.body;

      if (
        stock === undefined ||
        stock < 0
      ) {
        return res.status(400).json({
          error:
            'Valid stock quantity required'
        });
      }

      const merchant =
        await prisma.merchant.findUnique({
          where: {
            userId: req.user.id
          }
        });

      if (!merchant) {
        return res.status(404).json({
          error: 'Merchant not found'
        });
      }

      const updated =
        await MerchantTypeService.updateStock(
          merchant.id,
          productId,
          stock,
          reason
        );

      return res.json({
        success: true,
        product: updated
      });
    } catch (error: any) {
      console.error(
        'Update stock error:',
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }
}