// src/modules/admin/admin.service.ts

import { prisma } from "../../config/db";

export class AdminService {
  static async getStats() {
    try {
      const [totalOrders, totalUsers, totalDrivers, totalMerchants, completedOrders, pendingOrders] = await Promise.all([
        prisma.order.count(),
        prisma.user.count(),
        prisma.driver.count(),
        prisma.merchant.count(),
        prisma.order.count({ where: { status: "completed" } }),
        prisma.order.count({ where: { status: { in: ["pending", "paid", "assigned"] } } })
      ]);

      // Get total revenue from completed orders
      const revenueResult = await prisma.order.aggregate({
        _sum: { amount: true },
        where: { status: "completed" }
      });

      const totalRevenue = revenueResult._sum.amount || 0;

      return {
        totalOrders,
        totalUsers,
        totalDrivers,
        totalMerchants,
        completedOrders,
        pendingOrders,
        totalRevenue: Number(totalRevenue)
      };
    } catch (error) {
      console.error("Error in getStats:", error);
      return {
        totalOrders: 0,
        totalUsers: 0,
        totalDrivers: 0,
        totalMerchants: 0,
        completedOrders: 0,
        pendingOrders: 0,
        totalRevenue: 0
      };
    }
  }

  static async getUsers() {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          phone: true,
          role: true,
          createdAt: true,
          driver: {
            select: { name: true, status: true, wallet: true }
          },
          merchant: {
            select: { businessName: true, products: true }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      return users;
    } catch (error) {
      console.error("Error in getUsers:", error);
      return [];
    }
  }

  static async getOrders() {
    try {
      const orders = await prisma.order.findMany({
        include: {
          user: {
            select: { name: true, email: true, phone: true }
          },
          merchant: { select: { businessName: true } },
          driver: {
            include: { user: { select: { name: true } } }
          },
          items: {
            include: { product: true }
          }
        },
        orderBy: { createdAt: "desc" },
        take: 100
      });
      return orders;
    } catch (error) {
      console.error("Error in getOrders:", error);
      return [];
    }
  }

  static async getDrivers() {
    try {
      const drivers = await prisma.driver.findMany({
        include: {
          user: {
            select: { name: true, email: true, phone: true }
          },
          wallet: true
        }
      });
      return drivers;
    } catch (error) {
      console.error("Error in getDrivers:", error);
      return [];
    }
  }

  static async getMerchants() {
    try {
      const merchants = await prisma.merchant.findMany({
        include: {
          user: {
            select: { name: true, email: true, phone: true }
          },
          products: true
        }
      });
      return merchants;
    } catch (error) {
      console.error("Error in getMerchants:", error);
      return [];
    }
  }
}