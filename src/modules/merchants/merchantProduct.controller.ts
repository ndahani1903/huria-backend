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
        createdAt: p.createdAt
      }));

      res.json(transformed);
    } catch (error: any) {
      console.error("Get merchant products error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  // Create a new product
  static async createProduct(req: AuthRequest, res: Response) {
    try {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user!.id }
      });

      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }

      const { name, price, stock, description, category, variants } = req.body;
      
      // Get uploaded image URLs from multer
      const files = (req as any).files as Express.Multer.File[];
      const imageUrls = files?.map((f: any) => f.path) || [];

      // Handle variants (could be JSON string or object)
      let parsedVariants = {};
      if (variants) {
        try {
          parsedVariants = typeof variants === "string" ? JSON.parse(variants) : variants;
        } catch (e) {
          parsedVariants = {};
        }
      }

      const product = await prisma.product.create({
        data: {
          name,
          price: parseFloat(price),
          stock: parseInt(stock) || 0,
          description: description || null,
          category: category || "uncategorized",
          images: imageUrls,
          isActive: true,
          merchantId: merchant.id,

    variants: {
      create: Array.isArray(parsedVariants)
        ? parsedVariants.map((v: any) => ({
            size: v.size,
            color: v.color,
            sku: v.sku,
            stock: Number(v.stock || 0),
            price: v.price ? Number(v.price) : null
          }))
        : []
    }
  },

  include: {
    variants: true
        }
      });

      // Return transformed product
      res.status(201).json({
        id: product.id,
        name: product.name,
        price: Number(product.price),
        stock: product.stock,
        description: product.description,
        images: product.images as string[],
        image: (product.images as string[])?.[0] || "",
        variants: product.variants,
        category: product.category,
        isActive: product.isActive,
        createdAt: product.createdAt
      });
    } catch (error: any) {
      console.error("Create product error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  // Update a product
  static async updateProduct(req: AuthRequest, res: Response) {
    try {
      const id = req.params.id as string;
      const { name, price, stock, description, category, variants, images } = req.body;

      // Verify product belongs to merchant
      const existingProduct = await prisma.product.findFirst({
        where: {
          id,
          merchant: { userId: req.user!.id }
         },
  include: {
    variants: true
        }
      });

      if (!existingProduct) {
        return res.status(404).json({ error: "Product not found" });
      }

     await prisma.productVariant.deleteMany({
  where: { productId: id }
});

      const updated = await prisma.product.update({
        where: { id },
       data: {
    name: name ?? existingProduct.name,
    price: price !== undefined
      ? parseFloat(price)
      : existingProduct.price,

    stock: stock !== undefined
      ? parseInt(stock)
      : existingProduct.stock,

    description:
      description ?? existingProduct.description,

    category:
      category ?? existingProduct.category,

    images:
      images ?? existingProduct.images,

    variants: {
      create: Array.isArray(variants)
        ? variants.map((v: any) => ({
            size: v.size,
            color: v.color,
            sku: v.sku,
            stock: Number(v.stock || 0),
            price: v.price ? Number(v.price) : null
          }))
        : []
    }
  },

  include: {
    variants: true
  }
});

      res.json({
        id: updated.id,
        name: updated.name,
        price: Number(updated.price),
        stock: updated.stock,
        description: updated.description,
        images: updated.images as string[],
        image: (updated.images as string[])?.[0] || "",
        variants: updated.variants,
        category: updated.category,
        isActive: updated.isActive
      });
    } catch (error: any) {
      console.error("Update product error:", error);
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