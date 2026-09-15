 // src/modules/social-v2/repositories/notification.repository.ts

import { prisma } from "../../../config/db";

export class NotificationRepository {
  static async create(data: any) {
    return prisma.socialNotification.create({
      data,
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });
  }

  static async findByUserId(userId: string, skip: number, take: number) {
    return prisma.socialNotification.findMany({
      where: { userId },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  }

  static async markAsRead(notificationId: string) {
    return prisma.socialNotification.update({
      where: { id: notificationId },
      data: { read: true },
    });
  }

  static async markAllAsRead(userId: string) {
    return prisma.socialNotification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }

  static async getUnreadCount(userId: string) {
    return prisma.socialNotification.count({
      where: { userId, read: false },
    });
  }

  static async deleteNotification(notificationId: string) {
    return prisma.socialNotification.delete({
      where: { id: notificationId },
    });
  }

  static async deleteAllForUser(userId: string) {
    return prisma.socialNotification.deleteMany({
      where: { userId },
    });
  }

  static async getCountsByType(userId: string) {
    const types = await prisma.socialNotification.groupBy({
      by: ["type"],
      where: { userId, read: false },
      _count: true,
    });

    return types.reduce((acc, curr) => {
      acc[curr.type] = curr._count;
      return acc;
    }, {} as Record<string, number>);
  }
}