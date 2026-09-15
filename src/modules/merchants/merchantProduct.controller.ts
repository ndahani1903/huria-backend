import { Request, Response } from "express";
import { prisma } from "../../config/db";
import { AuthRequest } from "../../middleware/auth.middleware";

export class MerchantProductController {
  // Get all products for authenticated merchant
  static async getMyProducts(req: AuthRequest, res: Response) {
    try {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user!.id }
      });

      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }
      const id = req.params.id as string;
      const products = await prisma.product.findMany({
        where: { merchantId: merchant.id },
        include: {
    variants: true
  },
        orderBy: { createdAt: "desc" }
      });

      // Transform to frontend-friendly format
      const transformed = products.map(p => ({
        id: p.id,
        name: p.name,
        price: Number(p.price),
        stock: p.stock,
        description: p.description || "",
        images: p.images as string[],
        image: (p.images as string[])?.[0] || "",
        variants: p.variants || [],
        category: p.category,
        isActive: p.isActive,
        createdAt: p.createdAt,
        weightBracket: p.weightBracket,
      allowedVehicles: p.allowedVehicles,
      // ✅ ADD RESTAURANT FIELDS
      preparationTime: p.preparationTime,
      dietaryInfo: p.dietaryInfo,
      isSpicy: p.isSpicy,
      isVegetarian: p.isVegetarian,
      isVegan: p.isVegan,
      isGlutenFree: p.isGlutenFree,
      modifiers: p.modifiers,
      barcode: p.barcode,
      expiryDate: p.expiryDate,
      weight: p.weight,
      unit: p.unit,
      aisleLocation: p.aisleLocation,
      minimumOrderQuantity: p.minimumOrderQuantity,
      maximumOrderQuantity: p.maximumOrderQuantity,
      bulkDiscountQuantity: p.bulkDiscountQuantity,
      bulkDiscountPercent: p.bulkDiscountPercent,
      nutritionalInfo: p.nutritionalInfo,
      // Deals and flash sales
      isDeal: p.isDeal,
      dealDiscount: p.dealDiscount,
      dealEndDate: p.dealEndDate,
      isFlashSale: p.isFlashSale,
      flashDiscount: p.flashDiscount,
      flashSaleEnd: p.flashSaleEnd
      }));

      res.json(transformed);
    } catch (error: any) {
      console.error("Get merchant products error:", error);
      res.status(500).json({ error: error.message });
    }
  }


  // Delete (soft delete) a product
  static async deleteProduct(req: AuthRequest, res: Response) {
    try {
      const id = req.params.id as string;

      const existingProduct = await prisma.product.findFirst({
        where: {
          id,
          merchant: { userId: req.user!.id }
        }
      });

      if (!existingProduct) {
        return res.status(404).json({ error: "Product not found" });
      } 

      await prisma.product.update({
        where: { id },
        data: { isActive: false, stock: 0 }
      });

      res.json({ message: "Product deleted successfully", id });
    } catch (error: any) {
      console.error("Delete product error:", error);
      res.status(500).json({ error: error.message });
    }
  }
}