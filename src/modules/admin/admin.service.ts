import { prisma } from "../../config/db";

export class AdminService {
  static async getStats() {
    const totalOrders = await prisma.order.count();
    const totalUsers = await prisma.user.count();
    const totalDrivers = await prisma.driver.count();

    const revenue = await prisma.payment.aggregate({
      _sum: { amount: true },
    });

    return {
      totalOrders,
      totalUsers,
      totalDrivers,
      totalRevenue: revenue._sum.amount || 0,
    };
  }

  static async getOrders() {
    return prisma.order.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  static async getUsers() {
    return prisma.user.findMany();
  }
}
