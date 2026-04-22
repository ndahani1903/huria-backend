import { Request, Response } from 'express';
import { prisma } from '../../config/db';

export class MerchantController {
  // Get merchant's own products
  static async getMyProducts(req: any, res: Response) {
    try {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }
      
      const products = await prisma.product.findMany({
        where: { 
          merchantId: merchant.id,
          isActive: true  // ✅ Only show active products
        },
        orderBy: { createdAt: 'desc' }
      });
      
      res.json(products);
    } catch (error: any) {
      console.error("Get products error:", error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Add new product
  static async addProduct(req: any, res: Response) {
    try {
      const { name, price, stock, image, description } = req.body;
      
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }
      
      const product = await prisma.product.create({
        data: {
          name,
          price: parseFloat(price),
          stock: parseInt(stock) || 0,
          image: image || null,
          description: description || null,
          isActive: true,  // ✅ New products are active
          merchantId: merchant.id
        }
      });
      
      res.json(product);
    } catch (error: any) {
      console.error("Add product error:", error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Update product
  static async updateProduct(req: any, res: Response) {
    try {
      const { id } = req.params;
      const { name, price, stock, image, description } = req.body;
      
      const productId = id;

      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
     if (!merchant) {
      return res.status(404).json({ error: "Merchant not found" });
    }

      const product = await prisma.product.findFirst({
        where: { 
          id: productId,
          merchantId: merchant?.id,
          isActive: true  // ✅ Only update active products
        }
      });
      
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
    // ✅ FIX: Allow updating stock to any value (increase or decrease)
      const updated = await prisma.product.update({
        where: { id: productId },
        data: {
           name: name !== undefined ? name : product.name,
          price: price !== undefined ? parseFloat(price) : product.price,
          stock: stock !== undefined ? parseInt(stock) : product.stock,
          image: image !== undefined ? image : product.image,
          description: description !== undefined ? description : product.description
        }
      });
      
      res.json(updated);
    } catch (error: any) {
     console.error("Update product error:", error);
     res.status(500).json({ error: error.message });
    }
  }
  
  // ✅ SOFT DELETE - Just mark as inactive instead of deleting
  static async deleteProduct(req: any, res: Response) {
    try {
      const { id } = req.params;
      const productId = id;

      console.log(`🗑️  Soft deleting product with ID: ${productId}`);

      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
     if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }

      const product = await prisma.product.findFirst({
        where: { 
          id: productId,
          merchantId: merchant?.id,
          isActive: true  // ✅ Only delete active products
        }
      });
      
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      //await prisma.product.delete({
       // where: { id: productId }
      //});

       // ✅ SOFT DELETE: Just mark as inactive
      const updated = await prisma.product.update({
        where: { id: productId },
        data: { 
          isActive: false,
          stock: 0  // Also set stock to 0
        }
      });

      console.log(`✅ Product ${productId} soft deleted (marked as inactive)`);
      res.json({ 
         message: "Product deleted successfully", 
         id: productId,
        softDelete: true 
     });
    } catch (error) {
      console.error("Delete product error:", error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Get merchant's orders
  static async getMyOrders(req: any, res: Response) {
    try {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }
      
      const orders = await prisma.order.findMany({
        where: {
          items: {
            some: {
              merchantId: merchant.id
            }
          }
        },
        include: {
          items: {
            where: { merchantId: merchant.id },
            include: { 
              product: true   // ✅ Only show active products }
          }
         },
         user: true
       },
        orderBy: { createdAt: 'desc' }
      });
      
      res.json(orders);
    } catch (error: any) {
      console.error("Get orders error:", error);
      res.status(500).json({ error: error.message });
    }
  }
  
  // Get merchant earnings
  static async getEarnings(req: any, res: Response) {
    try {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: "Merchant not found" });
      }
      
      const orders = await prisma.orderItem.findMany({
        where: { merchantId: merchant.id },
        include: { order: true }
      });
      
      const totalEarnings = orders.reduce((sum, item) => {
        if (item.order.status === 'completed') {
          return sum + (item.price * item.quantity);
        }
        return sum;
      }, 0);
      
      const pendingEarnings = orders.reduce((sum, item) => {
        if (item.order.status === 'paid' || item.order.status === 'assigned') {
          return sum + (item.price * item.quantity);
        }
        return sum;
      }, 0);
      
      res.json({
        totalEarnings,
        pendingEarnings,
        completedOrders: orders.filter(o => o.order.status === 'completed').length,
        pendingOrders: orders.filter(o => o.order.status === 'paid' || o.order.status === 'assigned').length
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}