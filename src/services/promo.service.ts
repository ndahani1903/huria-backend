// src/services/promo.service.ts

import { prisma } from "../config/db";
import { Decimal } from "@prisma/client/runtime/library";

export interface PromoValidationResult {
  valid: boolean;
  discountPercentage?: number;
  discountAmount?: number;
  message?: string;
  promo?: any;
}

export class PromoService {
  
  /**
   * Validate and apply a promo code
   */
  static async validatePromoCode(
    code: string,
    userId: string,
    subtotal: number,
    merchantId?: string
  ): Promise<PromoValidationResult> {
    
    // Find the promo code
    const promo = await prisma.promoCode.findFirst({
      where: {
        code: code.toUpperCase(),
        isActive: true,
        startDate: {
          lte: new Date()
        },
        endDate: {
          gte: new Date()
        }
      }
    });
    
    if (!promo) {
      return {
        valid: false,
        message: "Invalid or expired promo code"
      };
    }
    
    // Check if it's merchant-specific and matches
    if (
      promo.merchantId &&
      promo.merchantId !== merchantId
    ) {
      return {
        valid: false,
        message: "Promo code not valid for this store"
      };
    }
    
    // Check minimum order amount
    if (
      promo.minOrderAmount &&
      new Decimal(subtotal).lessThan(
        promo.minOrderAmount
      )
    ) {
      return {
        valid: false,
        message: `Minimum order of TSh ${promo.minOrderAmount
          .toNumber()
          .toLocaleString()} required`
      };
    }
    
    // Check usage limit (total)
    if (promo.usageLimit) {
      const totalUsed =
        await prisma.promoUsage.count({
          where: {
            promoId: promo.id
          }
        });
      
      if (totalUsed >= promo.usageLimit) {
        return {
          valid: false,
          message: "Promo code has reached usage limit"
        };
      }
    }
    
    // Check per-user usage limit
    const userUsed =
      await prisma.promoUsage.count({
        where: {
          promoId: promo.id,
          userId
        }
      });
    
    if (userUsed >= promo.usagePerUser) {
      return {
        valid: false,
        message: "You've already used this promo code"
      };
    }
    
    // Calculate discount
    let discountAmount = 0;
    let discountPercentage = 0;
    
    if (promo.discountType === "percentage") {
      discountPercentage = promo.discountValue;
      discountAmount =
        (subtotal * promo.discountValue) / 100;
      
      // Apply maximum discount cap if set
      if (
        promo.maxDiscount &&
        discountAmount >
          promo.maxDiscount.toNumber()
      ) {
        discountAmount =
          promo.maxDiscount.toNumber();
      }
    } else {
      // Fixed amount discount
      discountAmount = Math.min(
        promo.discountValue,
        subtotal
      );
    }
    
    return {
      valid: true,
      discountPercentage,
      discountAmount,
      promo
    };
  }
  
  /**
   * Apply promo code to order
   * Marks the promo as used.
   */
  static async applyPromoToOrder(
    promoId: string,
    userId: string,
    orderId: string,
    discountAmount: number
  ): Promise<void> {
    await prisma.promoUsage.create({
      data: {
        promoId,
        userId,
        orderId,
        discountAmount
      }
    });
  }
  
  /**
   * Get available promos for a user
   */
  static async getUserAvailablePromos(
    userId: string,
    subtotal: number
  ): Promise<any[]> {
    const now = new Date();
    
    const promos =
      await prisma.promoCode.findMany({
        where: {
          isActive: true,
          startDate: {
            lte: now
          },
          endDate: {
            gte: now
          },
          OR: [
            {
              usageLimit: null
            },
            {
              usageLimit: {
                gt: 0
              }
            }
          ]
        },
        include: {
          usages: {
            where: {
              userId
            },
            take: 1
          }
        }
      });
    
    // Filter promos user hasn't exceeded usage for
    const available: any[] = [];
    
    for (const promo of promos) {
      const userUsageCount =
        promo.usages.length;
      
      if (
        userUsageCount <
        promo.usagePerUser
      ) {
        // Check minimum order amount
        if (
          !promo.minOrderAmount ||
          new Decimal(subtotal).gte(
            promo.minOrderAmount
          )
        ) {
          available.push({
            id: promo.id,
            code: promo.code,
            type: promo.type,
            discountType: promo.discountType,
            discountValue: promo.discountValue,
            description:
              this.getPromoDescription(promo)
          });
        }
      }
    }
    
    return available;
  }
  
  /**
   * Create a promo code
   * Admin or Merchant.
   */
  static async createPromoCode(
    data: {
      code: string;
      type: string;
      discountType: "percentage" | "fixed";
      discountValue: number;
      minOrderAmount?: number;
      maxDiscount?: number;
      usageLimit?: number;
      usagePerUser?: number;
      merchantId?: string;
      startDate: Date;
      endDate: Date;
    },
    createdBy: string,
    isAdmin: boolean
  ): Promise<any> {
    
    // Only admin can create global promos.
    // Merchants can create promos for their own merchant.
    if (data.merchantId && !isAdmin) {
      // Verify merchant owns this ID
      const merchant =
        await prisma.merchant.findFirst({
          where: {
            id: data.merchantId,
            userId: createdBy
          }
        });
      
      if (!merchant) {
        throw new Error(
          "Unauthorized to create promo for this merchant"
        );
      }
    } else if (
      !data.merchantId &&
      !isAdmin
    ) {
      throw new Error(
        "Only admins can create global promos"
      );
    }
    
    // Check if code already exists
    const existing =
      await prisma.promoCode.findUnique({
        where: {
          code: data.code.toUpperCase()
        }
      });
    
    if (existing) {
      throw new Error(
        "Promo code already exists"
      );
    }
    
    return prisma.promoCode.create({
      data: {
        code: data.code.toUpperCase(),
        type: data.type,
        discountType: data.discountType,
        discountValue: data.discountValue,
        minOrderAmount:
          data.minOrderAmount !== undefined
            ? new Decimal(data.minOrderAmount)
            : undefined,
        maxDiscount:
          data.maxDiscount !== undefined
            ? new Decimal(data.maxDiscount)
            : undefined,
        usageLimit: data.usageLimit,
        usagePerUser:
          data.usagePerUser || 1,
        merchantId: data.merchantId,
        startDate: data.startDate,
        endDate: data.endDate,
        isActive: true
      }
    });
  }
  
  /**
   * Auto-create welcome promo when user subscribes
   */
  static async createWelcomePromo(
    userId: string,
    discountPercentage: number
  ): Promise<void> {
    const existing =
      await prisma.promoCode.findFirst({
        where: {
          type: "welcome",
          usages: {
            some: {
              userId
            }
          }
        }
      });
    
    if (existing) {
      return;
    }
    
    const startDate = new Date();
    const endDate = new Date();
    
    endDate.setDate(
      endDate.getDate() + 30
    );
    
    await prisma.promoCode.create({
      data: {
        code: `WELCOME${discountPercentage}`,
        type: "welcome",
        discountType: "percentage",
        discountValue: discountPercentage,
        startDate,
        endDate,
        usagePerUser: 1,
        isActive: true
      }
    });
  }
  
  /**
   * Generate a human-readable promo description
   */
  private static getPromoDescription(
    promo: any
  ): string {
    if (
      promo.discountType === "percentage"
    ) {
      let desc =
        `${promo.discountValue}% OFF`;
      
      if (promo.minOrderAmount) {
        desc +=
          ` on orders over TSh ${promo.minOrderAmount
            .toNumber()
            .toLocaleString()}`;
      }
      
      if (promo.maxDiscount) {
        desc +=
          ` (max TSh ${promo.maxDiscount
            .toNumber()
            .toLocaleString()})`;
      }
      
      return desc;
    }
    
    return `TSh ${promo.discountValue.toLocaleString()} OFF`;
  }
}

export default PromoService;