import { prisma } from "../../config/db";

export class AdminService {
   static async getStats() {
    const totalOrders = await prisma.order.count();
    const totalUsers = await prisma.user.count();
    const totalDrivers = await prisma.driver.count();
    const totalMerchants = await prisma.merchant.count();
    
    const completedOrders = await prisma.order.count({
      where: { status: "completed" }
    });
    
    const pendingOrders = await prisma.order.count({
      where: { status: { in: ["pending", "paid", "assigned"] } }
    });

    const revenue = await prisma.payment.aggregate({
      _sum: { amount: true },
      where: { status: "released" }
    });

    // Get total revenue from completed orders
    const ordersRevenue = await prisma.order.aggregate({
      _sum: { amount: true },
      where: { status: "completed" }
    });

    return {
      totalOrders,
      totalUsers,
      totalDrivers,
      totalMerchants,
      completedOrders,
      pendingOrders,
      totalRevenue: revenue._sum.amount || ordersRevenue._sum.amount || 0,
    };
  }

  // Get all users
   static async getUsers() {
    return prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
        driver: {
          include: { wallet: true }
        },
        merchant: {
          include: { products: true }
        }
      }
    });
  }


   // 📦 ALL ORDERS
 // Get all orders
  static async getOrders() {
    return prisma.order.findMany({
      include: {
        user: {
          select: { name: true, email: true, phone: true }
        },
        driver: {
          include: { user: { select: { name: true } } }
        },
        items: {
          include: { product: true }
        }
      },
      orderBy: { createdAt: "desc" },
    });
  }
}
