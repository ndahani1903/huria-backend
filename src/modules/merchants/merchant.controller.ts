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
        where: { merchantId: merchant.id }
      });
      
      res.json(products);
    } catch (error) {
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
          price,
          stock: stock || 0,
          image,
          description,
          merchantId: merchant.id
        }
      });
      
      res.json(product);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  // Update product
  static async updateProduct(req: any, res: Response) {
    try {
      const { id } = req.params;
      const { name, price, stock, image, description } = req.body;
      
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      const product = await prisma.product.findFirst({
        where: { 
          id: parseInt(id),
          merchantId: merchant?.id
        }
      });
      
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      const updated = await prisma.product.update({
        where: { id: parseInt(id) },
        data: { name, price, stock, image, description }
      });
      
      res.json(updated);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  // Delete product
  static async deleteProduct(req: any, res: Response) {
    try {
      const { id } = req.params;
      
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      const product = await prisma.product.findFirst({
        where: { 
          id: parseInt(id),
          merchantId: merchant?.id
        }
      });
      
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      
      await prisma.product.delete({
        where: { id: parseInt(id) }
      });
      
      res.json({ message: "Product deleted" });
    } catch (error) {
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
            include: { product: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      
      res.json(orders);
    } catch (error) {
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