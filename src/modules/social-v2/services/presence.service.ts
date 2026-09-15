// src/modules/social-v2/services/presence.service.ts
import redis from "../../../config/redis";
import { SocialCache } from "../utils/social-cache";
import { SOCIAL } from "../social.constants";
import { io } from "../../../server";

interface PresenceData {
  userId: string;
  socketId: string;
  status: "ONLINE" | "AWAY" | "OFFLINE";
  lastSeen?: Date;
}

export class PresenceService {
  static async setOnline(userId: string, socketId: string) {
    // Set in Redis with 2-minute TTL
    await SocialCache.setOnline(userId, socketId);

    // Store socket ID mapping
    await redis.setex(
      `${SOCIAL.REDIS.USER_SOCKET}${userId}`,
      120,
      socketId
    );

    // Update presence in database
    await prisma.userPresence.upsert({
      where: { userId },
      update: {
        isOnline: true,
        lastSeen: new Date(),
        updatedAt: new Date(),
      },
      create: {
        userId,
        isOnline: true,
        lastSeen: new Date(),
      },
    });

    // Broadcast to followers
    await this.broadcastPresence(userId, "ONLINE");

    return { success: true };
  }

  static async setOffline(userId: string) {
    await SocialCache.removeOnline(userId);
    await redis.del(`${SOCIAL.REDIS.USER_SOCKET}${userId}`);

    await prisma.userPresence.update({
      where: { userId },
      data: {
        isOnline: false,
        lastSeen: new Date(),
        updatedAt: new Date(),
      },
    });

    await this.broadcastPresence(userId, "OFFLINE");

    return { success: true };
  }

  static async setAway(userId: string) {
    await prisma.userPresence.update({
      where: { userId },
      data: {
        isOnline: true,
        lastSeen: new Date(),
        updatedAt: new Date(),
      },
    });

    await this.broadcastPresence(userId, "AWAY");

    return { success: true };
  }

  static async isOnline(userId: string): Promise<boolean> {
    return SocialCache.isOnline(userId);
  }

  static async getOnlineUsers(userIds: string[]): Promise<string[]> {
    const onlineUsers: string[] = [];
    for (const userId of userIds) {
      const online = await SocialCache.isOnline(userId);
      if (online) onlineUsers.push(userId);
    }
    return onlineUsers;
  }

  static async getOnlineFollowers(userId: string): Promise<string[]> {
    const followers = await prisma.follow.findMany({
      where: { followingId: userId, status: "ACCEPTED" },
      select: { followerId: true },
    });

    const followerIds = followers.map((f) => f.followerId);
    return this.getOnlineUsers(followerIds);
  }

  private static async broadcastPresence(userId: string, status: "ONLINE" | "AWAY" | "OFFLINE") {
    // Get all followers
    const followers = await prisma.follow.findMany({
      where: { followingId: userId, status: "ACCEPTED" },
      select: { followerId: true },
    });

    for (const follower of followers) {
      io.to(`user:${follower.followerId}`).emit("presence:update", {
        userId,
        status,
        timestamp: new Date().toISOString(),
      });
    }
  }

  static async updateLastSeen(userId: string) {
    await prisma.userPresence.update({
      where: { userId },
      data: {
        lastSeen: new Date(),
        updatedAt: new Date(),
      },
    });

    return { success: true };
  }

  static async getPresenceStatus(userId: string): Promise<PresenceData | null> {
    const online = await SocialCache.isOnline(userId);

    if (online) {
      const socketId = await redis.get(`${SOCIAL.REDIS.USER_SOCKET}${userId}`);
      return {
        userId,
        socketId: socketId?.toString() || "",
        status: "ONLINE",
      };
    }

    const presence = await prisma.userPresence.findUnique({
      where: { userId },
    });

    if (presence) {
      return {
        userId,
        socketId: "",
        status: "OFFLINE",
        lastSeen: presence.lastSeen || undefined,
      };
    }

    return null;
  }
} 