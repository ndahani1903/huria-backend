import { prisma } from "../../config/db";

export class UserService {
  static async getMe(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        emailVerified: true,
        role: true,
        createdAt: true
      }
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Get orders count
    const ordersCount = await prisma.order.count({
      where: { userId }
    });

    // Get total spent
    const orders = await prisma.order.findMany({
      where: { 
        userId,
        status: "completed"
      },
      select: { amount: true }
    });

    const totalSpent = orders.reduce((sum, order) => sum + Number(order.amount), 0);

    return {
      ...user,
      ordersCount,
      totalSpent
    };
  }

  static async updateMe(userId: string, data: { name?: string; avatar?: string }) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        avatar: data.avatar
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        emailVerified: true,
        role: true
      }
    });

    return user;
  }
}