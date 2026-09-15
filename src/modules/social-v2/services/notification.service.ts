// src/modules/social-v2/services/notification.service.ts
import { prisma } from "../../../config/db";
import { SocialSocket } from "../social.socket";
import { io } from "../../../server";
import { SOCIAL } from "../social.constants";

export interface NotificationInput {
  userId: string;
  actorId?: string;
  type: string;
  title: string;
  body?: string;
  entityId?: string;
}

export class NotificationService {
  static async createNotification(input: NotificationInput) {
    const { userId, actorId, type, title, body, entityId } = input;

    const notification = await prisma.socialNotification.create({
      data: {
        userId,
        actorId,
        type,
        title,
        body,
        entityId,
      },
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

    // Send real-time notification
    SocialSocket.emitNotification(io, userId, {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      actor: notification.actor,
      entityId: notification.entityId,
      createdAt: notification.createdAt,
    });

    return notification;
  }

  static async getNotifications(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      prisma.socialNotification.findMany({
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
        take: limit,
      }),
      prisma.socialNotification.count({ where: { userId } }),
    ]);

    const unreadCount = await prisma.socialNotification.count({
      where: { userId, read: false },
    });

    return {
      data: notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total,
      },
    };
  }

  static async markAsRead(notificationId: string, userId: string) {
    const notification = await prisma.socialNotification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new Error("Notification not found");
    }

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

  // Convenience methods for common notifications
  static async notifyPostLike(postId: string, actorId: string, recipientId: string) {
    const post = await prisma.socialPost.findUnique({
      where: { id: postId },
      include: { author: true },
    });

    if (!post) return;

    return this.createNotification({
      userId: recipientId,
      actorId,
      type: "LIKE",
      title: "New Like",
      body: `${post.author.name} liked your post`,
      entityId: postId,
    });
  }

  static async notifyPostComment(postId: string, comment: string, actorId: string, recipientId: string) {
    const post = await prisma.socialPost.findUnique({
      where: { id: postId },
      include: { author: true },
    });

    if (!post) return;

    return this.createNotification({
      userId: recipientId,
      actorId,
      type: "COMMENT",
      title: "New Comment",
      body: `${post.author.name} commented on your post: "${comment.slice(0, 50)}${comment.length > 50 ? '...' : ''}"`,
      entityId: postId,
    });
  }

  static async notifyStoryLike(storyId: string, actorId: string, recipientId: string) {
    const story = await prisma.socialStory.findUnique({
      where: { id: storyId },
      include: { user: true },
    });

    if (!story) return;

    return this.createNotification({
      userId: recipientId,
      actorId,
      type: "STORY",
      title: "Story Reaction",
      body: `${story.user.name} reacted to your story`,
      entityId: storyId,
    });
  }

  static async notifyMention(actorId: string, recipientId: string, postId: string) {
    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: { name: true },
    });

    if (!actor) return;

    return this.createNotification({
      userId: recipientId,
      actorId,
      type: "MENTION",
      title: "You were mentioned",
      body: `${actor.name} mentioned you in a post`,
      entityId: postId,
    });
  }

  static async deleteNotification(notificationId: string, userId: string) {
    const notification = await prisma.socialNotification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new Error("Notification not found");
    }

    return prisma.socialNotification.delete({
      where: { id: notificationId },
    });
  }

  static async deleteAllUserNotifications(userId: string) {
    return prisma.socialNotification.deleteMany({
      where: { userId },
    });
  }
} 