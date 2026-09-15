import { prisma } from "../../config/db";

export class ProductService {
  static async getAll(query?: any) {
    const page = Number(query?.page || 1);
    const limit = Number(query?.limit || 50000);
    const skip = (page - 1) * limit;

    return prisma.product.findMany({
      where: {
        isActive: true
      },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        description: true,
        images: true,
        category: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        averageRating: true,
        merchantId: true,
        // ✅ ADD DEAL FIELDS
        isDeal: true,
        dealDiscount: true,
        dealEndDate: true,
        // ✅ ADD FLASH SALE FIELDS
        isFlashSale: true,
        flashDiscount: true,
        flashSaleEnd: true,
        // ✅ ADD OTHER NEW FIELDS
        tags: true,
        rating: true,
        gender: true,
        discountEligible: true,
        newUserDiscount: true,
        merchant: {
          select: {
            businessName: true,
            rating: true
          }
        },
        variants: {
          select: {
            id: true,
            size: true,
            color: true,
            sku: true,
            price: true,
            stock: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit
    });
  }

  static async getById(productId: string) {
    return prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        description: true,
        images: true,
        category: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        averageRating: true,
        merchantId: true,
        // ✅ ADD DEAL FIELDS
        isDeal: true,
        dealDiscount: true,
        dealEndDate: true,
        // ✅ ADD FLASH SALE FIELDS
        isFlashSale: true,
        flashDiscount: true,
        flashSaleEnd: true,
        // ✅ ADD OTHER NEW FIELDS
        tags: true,
        rating: true,
        gender: true,
        discountEligible: true,
        newUserDiscount: true,
        merchant: {
          select: {
            id: true,
            name: true,
            businessName: true,
            rating: true,
            pickupAddress: true,
            pickupLat: true,
            pickupLng: true
          }
        },
        variants: {
          select: {
            id: true,
            size: true,
            color: true,
            sku: true,
            price: true,
            stock: true
          }
        }
      }
    });
  }

  static async getMyProducts(userId: string) {
    const merchant = await prisma.merchant.findUnique({
      where: { userId }
    });

    if (!merchant) throw new Error("Merchant not found");

    return prisma.product.findMany({
      where: {
        merchantId: merchant.id,
        isActive: true
      },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        description: true,
        images: true,
        category: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      // ✅ ADD THESE FIELDS
      weightBracket: true,
      allowedVehicles: true,
        // ✅ ADD DEAL FIELDS
        isDeal: true,
        dealDiscount: true,
        dealEndDate: true,
        // ✅ ADD FLASH SALE FIELDS
        isFlashSale: true,
        flashDiscount: true,
        flashSaleEnd: true,
        // ✅ ADD OTHER NEW FIELDS
        tags: true,
        rating: true,
        gender: true,
        discountEligible: true,
        newUserDiscount: true,
        preparationTime: true,
        dietaryInfo: true,
        isSpicy: true,
        isVegetarian: true,
        isVegan: true,
        isGlutenFree: true,
        modifiers: true,
        barcode: true,
        expiryDate: true,
        weight: true,
        unit: true,
        aisleLocation: true,
        minimumOrderQuantity: true,
        maximumOrderQuantity: true,
        bulkDiscountQuantity: true,
        bulkDiscountPercent: true,
        nutritionalInfo: true,
        variants: {
          select: {
            id: true,
            size: true,
            color: true,
            sku: true,
            price: true,
            stock: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  
  // ✅ ADD THIS NEW METHOD - Get products with active deals
  static async getActiveDeals() {
    const now = new Date();
    return prisma.product.findMany({
      where: {
        isActive: true,
        isDeal: true,
        dealEndDate: { gt: now }
      },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        description: true,
        images: true,
        category: true,
        isDeal: true,
        dealDiscount: true,
        dealEndDate: true,
        merchant: {
          select: {
            businessName: true,
            rating: true
          }
        },
        variants: true
      },
      orderBy: { dealDiscount: "desc" }
    });
  }

  // ✅ ADD THIS NEW METHOD - Get products with active flash sales
  static async getActiveFlashSales() {
    const now = new Date();
    return prisma.product.findMany({
      where: {
        isActive: true,
        isFlashSale: true,
        flashSaleEnd: { gt: now }
      },
      select: {
        id: true,
        name: true,
        price: true,
        stock: true,
        description: true,
        images: true,
        category: true,
        isFlashSale: true,
        flashDiscount: true,
        flashSaleEnd: true,
        merchant: {
          select: {
            businessName: true,
            rating: true
          }
        },
        variants: true
      },
      orderBy: { flashDiscount: "desc" }
    });
  }

  // ✅ ADD THIS NEW METHOD - Update product deal
  static async updateDeal(productId: string, merchantId: string, dealData: {
    isDeal: boolean;
    dealDiscount?: number;
    dealEndDate?: Date;
  }) {
    // Verify product belongs to merchant
    const product = await prisma.product.findFirst({
      where: { id: productId, merchantId }
    });

    if (!product) {
      throw new Error("Product not found or unauthorized");
    }

    return prisma.product.update({
      where: { id: productId },
      data: {
        isDeal: dealData.isDeal,
        dealDiscount: dealData.dealDiscount || 0,
        dealEndDate: dealData.dealEndDate || null
      },
      select: {
        id: true,
        name: true,
        price: true,
        isDeal: true,
        dealDiscount: true,
        dealEndDate: true
      }
    });
  }

  // ✅ ADD THIS NEW METHOD - Update product flash sale (Admin only)
  static async updateFlashSale(productId: string, flashData: {
    isFlashSale: boolean;
    flashDiscount?: number;
    flashSaleEnd?: Date;
  }) {
    return prisma.product.update({
      where: { id: productId },
      data: {
        isFlashSale: flashData.isFlashSale,
        flashDiscount: flashData.flashDiscount || 0,
        flashSaleEnd: flashData.flashSaleEnd || null
      },
      select: {
        id: true,
        name: true,
        price: true,
        isFlashSale: true,
        flashDiscount: true,
        flashSaleEnd: true
      }
    });
  }

  // ✅ ADD THIS NEW METHOD - Get products by gender
  static async getProductsByGender(gender: string) {
    return prisma.product.findMany({
      where: {
        isActive: true,
        gender: gender
      },
      select: {
        id: true,
        name: true,
        price: true,
        images: true,
        category: true,
        rating: true,
        isDeal: true,
        dealDiscount: true,
        isFlashSale: true,
        flashDiscount: true,
        merchant: {
          select: {
            businessName: true
          }
        }
      },
      take: 20
    });
  }

  // ✅ ADD THIS NEW METHOD - Get gift products
  static async getGiftProducts() {
    return prisma.product.findMany({
      where: {
        isActive: true,
        tags: { has: "gift" }
      },
      select: {
        id: true,
        name: true,
        price: true,
        images: true,
        category: true,
        rating: true,
        isDeal: true,
        dealDiscount: true,
        merchant: {
          select: {
            businessName: true
          }
        }
      },
      take: 20
    });
  }

  // ✅ ADD THIS NEW METHOD - Get high rated products (4+ stars)
  static async getHighRatedProducts() {
    return prisma.product.findMany({
      where: {
        isActive: true,
        rating: { gte: 4 }
      },
      select: {
        id: true,
        name: true,
        price: true,
        images: true,
        category: true,
        rating: true,
        isDeal: true,
        dealDiscount: true,
        merchant: {
          select: {
            businessName: true
          }
        }
      },
      orderBy: { rating: "desc" },
      take: 20
    });
  }





  static async remove(userId: string, productId: string) {
    const merchant = await prisma.merchant.findUnique({
      where: { userId }
    });

    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!merchant || !product) throw new Error("Product not found");

    return prisma.product.update({
      where: { id: productId },
      data: { isActive: false }
    });
  }

static async toggle(userId: string, productId: string) {
  const merchant = await prisma.merchant.findUnique({
    where: { userId }
  });

  const product = await prisma.product.findUnique({
    where: { id: productId }
  });

  if (!merchant || !product) {
    throw new Error("Product not found");
  }

  return prisma.product.update({
    where: { id: productId },
    data: {
      isActive: !product.isActive
    }
  });
}

static async updateStock(
  userId: string,
  productId: string,
  stock: number
) {
  const merchant = await prisma.merchant.findUnique({
    where: { userId }
  });

  const product = await prisma.product.findUnique({
    where: { id: productId }
  });

  if (!merchant || !product) {
    throw new Error("Product not found");
  }

  return prisma.product.update({
    where: { id: productId },
    data: {
      stock: Number(stock)
    }
  });
}

}