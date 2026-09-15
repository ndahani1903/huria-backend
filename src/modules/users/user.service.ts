import bcrypt from "bcrypt";
import { prisma } from "../../config/db";
import { Request } from "express";

export class UserService {
  
  // Get user profile with stats
  static async getProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        profileImage: true,
        emailVerified: true,
        role: true,
        createdAt: true,
        status: true,
      }
    });

    if (!user) throw new Error("User not found");

    // Get orders stats
    const [ordersCount, completedOrders] = await Promise.all([
      prisma.order.count({ where: { userId } }),
      prisma.order.findMany({
        where: { userId, status: "completed" },
        select: { amount: true }
      })
    ]);

    const totalSpent = completedOrders.reduce((sum, o) => sum + Number(o.amount), 0);

    return {
      ...user,
      ordersCount,
      totalSpent,
      // Driver specific stats (if driver)
      ...(await this.getDriverStats(userId)),
      // Merchant specific stats (if merchant)
      ...(await this.getMerchantStats(userId)),
    };
  }

  static async getDriverStats(userId: string) {
    const driver = await prisma.driver.findUnique({
      where: { userId },
      include: { wallet: true }
    });

    if (!driver) return {};

    const deliveriesToday = await prisma.order.count({
      where: {
        driverId: driver.id,
        status: "completed",
        completedAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0))
        }
      }
    });

    const deliveriesThisMonth = await prisma.order.count({
      where: {
        driverId: driver.id,
        status: "completed",
        completedAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        }
      }
    });

    return {
      deliveriesToday,
      deliveriesThisMonth,
      rating: driver.rating,
      totalDeliveries: driver.totalDeliveries,
      walletBalance: driver.wallet?.balance || 0,
      streak: await this.getDriverStreak(driver.id),
      level: await this.getDriverLevel(driver.totalDeliveries),
    };
  }

  static async getMerchantStats(userId: string) {
    const merchant = await prisma.merchant.findUnique({
      where: { userId }
    });

    if (!merchant) return {};

    const productsCount = await prisma.product.count({
      where: { merchantId: merchant.id }
    });

    const ordersCount = await prisma.order.count({
      where: { merchantId: merchant.id }
    });

    return {
      productsCount,
      merchantOrdersCount: ordersCount,
      merchantRating: merchant.rating,
      merchantVerified: merchant.verified,
      merchantType: merchant.merchantType,
    };
  }

  static async getDriverStreak(driverId: string): Promise<number> {
    const deliveries = await prisma.order.findMany({
      where: {
        driverId,
        status: "completed",
        completedAt: { not: null }
      },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true }
    });

    if (deliveries.length === 0) return 0;

    let streak = 0;
    let currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);

    for (const delivery of deliveries) {
      if (!delivery.completedAt) continue;
      const deliveryDate = new Date(delivery.completedAt);
      deliveryDate.setHours(0, 0, 0, 0);

      const diffDays = Math.floor((currentDate.getTime() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays === streak) {
        streak++;
      } else if (diffDays > streak) {
        break;
      }
    }

    return streak;
  }

  static async getDriverLevel(totalDeliveries: number): Promise<string> {
    if (totalDeliveries >= 1000) return "Diamond";
    if (totalDeliveries >= 500) return "Platinum";
    if (totalDeliveries >= 250) return "Gold";
    if (totalDeliveries >= 100) return "Silver";
    if (totalDeliveries >= 50) return "Bronze";
    return "Starter";
  }

  // Update profile
  static async updateProfile(userId: string, data: { name?: string; avatar?: string; profileImage?: string }) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        avatar: data.avatar,
        profileImage: data.profileImage,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        avatar: true,
        profileImage: true,
        role: true,
      }
    });

    await this.logActivity(userId, "Updated profile", { fields: Object.keys(data) });
    return user;
  }

  // Change password
  static async changePassword(userId: string, oldPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true }
    });

    if (!user) throw new Error("User not found");

    const isValid = await bcrypt.compare(oldPassword, user.password);
    if (!isValid) throw new Error("Current password is incorrect");

    if (oldPassword === newPassword) {
      throw new Error("New password must be different from current password");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    await this.logActivity(userId, "Changed password", { timestamp: new Date().toISOString() });

    return { success: true, message: "Password changed successfully" };
  }

  // Get notifications
  static async getNotifications(userId: string, limit = 50) {
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit
      }),
      prisma.notification.count({
        where: { userId, read: false }
      })
    ]);

    return {
      notifications,
      unreadCount,
      total: notifications.length
    };
  }

  // Mark notification as read
  static async markNotificationRead(userId: string, notificationId: string) {
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId }
    });

    if (!notification) throw new Error("Notification not found");

    await prisma.notification.update({
      where: { id: notificationId },
      data: { read: true }
    });

    return { success: true };
  }

  // Mark all notifications as read
  static async markAllNotificationsRead(userId: string) {
    await prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true }
    });

    return { success: true };
  }

  // Get activity logs
  static async getActivityLogs(userId: string, limit = 50) {
    return prisma.activityLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }

  // Log activity
  static async logActivity(userId: string, action: string, metadata?: any, req?: Request) {
    await prisma.activityLog.create({
      data: {
        userId,
        action,
        ip: req?.ip || req?.headers?.['x-forwarded-for'] as string || 'unknown',
        device: req?.headers?.['user-agent'] || 'unknown',
        // Store metadata as JSON
      }
    });
  }

  // Get notification settings
  static async getNotificationSettings(userId: string) {
    let settings = await prisma.userNotificationSettings.findUnique({
      where: { userId }
    });

    if (!settings) {
      // Create default settings if not exists
      settings = await prisma.userNotificationSettings.create({
        data: { userId }
      });
    }

    return settings;
  }

  // Update notification settings
  static async updateNotificationSettings(userId: string, data: any) {
    const settings = await prisma.userNotificationSettings.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data }
    });

    await this.logActivity(userId, "Updated notification settings");
    return settings;
  }

  // Create notification for user
  static async createNotification(userId: string, title: string, message: string, type = "info", data?: any) {
    return prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        data: data || {}
      }
    });
  }

  // Send test notification (for debugging)
  static async sendTestNotification(userId: string, type: string) {
    const messages = {
      order: { title: "Order Update", message: "Your order #123 has been confirmed!" },
      payment: { title: "Payment Received", message: "Your payment of TSh 25,000 was successful." },
      delivery: { title: "Delivery Update", message: "Your order is out for delivery!" },
      promotion: { title: "Special Offer", message: "🎉 20% off on your next order!" },
      security: { title: "Security Alert", message: "New login detected from Chrome browser." },
    };

    const msg = messages[type as keyof typeof messages] || messages.order;

    return this.createNotification(userId, msg.title, msg.message, type);
  }
}