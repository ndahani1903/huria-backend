// src/modules/social-v2/services/reel.service.ts
import { prisma } from "../../../config/db";
import { SocialSocket } from "../social.socket";
import { io } from "../../../server";
import { CreateReelInput } from "../dto/reel.dto";
import { SOCIAL } from "../social.constants";
import { SocialCache } from "../utils/social-cache";

export class ReelService {
  static async createReel(userId: string, input: CreateReelInput) {
    const { video, thumbnail, caption } = input;

    // Validate duration (if we had video duration from upload)
    // For now, we'll set a default duration

    const reel = await prisma.reel.create({
      data: {
        userId,
        videoUrl: video,
        thumbnailUrl: thumbnail || null,
        caption: caption || null,
        duration: 30, // Default duration, would come from video metadata
        socialProfile: {
          connect: { userId },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            verified: true,
          },
        },
      },
    });

    // Broadcast to followers
    const followers = await prisma.follow.findMany({
      where: { followingId: userId, status: "ACCEPTED" },
      select: { followerId: true },
    });

    for (const follower of followers) {
      io.to(`user:${follower.followerId}`).emit("reel:new", {
        reelId: reel.id,
        userId: reel.userId,
        userName: reel.user.name,
        caption: reel.caption,
      });
    }

    return reel;
  }

  static async getReel(reelId: string, viewerId?: string) {
    const reel = await prisma.reel.findUnique({
      where: { id: reelId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            verified: true,
          },
        },
        reelsMedia: true,
        reelsLikes: {
          where: viewerId ? { userId: viewerId } : undefined,
          select: { userId: true },
        },
        _count: {
          select: {
            reelsLikes: true,
            reelsComments: true,
            reelsViews: true,
          },
        },
      },
    });

    if (!reel) {
      throw new Error("Reel not found");
    }

    // Track view
    if (viewerId) {
      await prisma.reelView.create({
        data: {
          reelId,
          userId: viewerId,
          watchTime: 0,
        },
      });

      await prisma.reel.update({
        where: { id: reelId },
        data: { viewsCount: { increment: 1 } },
      });
    }

    return {
      ...reel,
      isLiked: reel.reelsLikes?.length > 0 || false,
      likesCount: reel._count.reelsLikes,
      commentsCount: reel._count.reelsComments,
      viewsCount: reel._count.reelsViews,
    };
  }

  static async getReelsFeed(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;

    // Get reels from followed users
    const following = await prisma.follow.findMany({
      where: { followerId: userId, status: "ACCEPTED" },
      select: { followingId: true },
    });

    const followingIds = following.map((f) => f.followingId);

    const reels = await prisma.reel.findMany({
      where: {
        userId: { in: [...followingIds, userId] },
        visibility: "PUBLIC",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            verified: true,
          },
        },
        reelsMedia: true,
        _count: {
          select: {
            reelsLikes: true,
            reelsComments: true,
            reelsViews: true,
          },
        },
      },
      orderBy: [
        { viewsCount: "desc" },
        { createdAt: "desc" },
      ],
      skip,
      take: limit,
    });

    return {
      data: reels,
      pagination: {
        page,
        limit,
        hasMore: reels.length === limit,
      },
    };
  }

  static async likeReel(reelId: string, userId: string) {
    const existing = await prisma.reelLike.findUnique({
      where: {
        reelId_userId: { reelId, userId },
      },
    });

    if (existing) {
      await prisma.reelLike.delete({
        where: { id: existing.id },
      });
      await prisma.reel.update({
        where: { id: reelId },
        data: { likesCount: { decrement: 1 } },
      });
      return { liked: false };
    }

    await prisma.reelLike.create({
      data: {
        reelId,
        userId,
        reaction: "LIKE",
      },
    });

    await prisma.reel.update({
      where: { id: reelId },
      data: { likesCount: { increment: 1 } },
    });

    // Notify reel owner
    const reel = await prisma.reel.findUnique({
      where: { id: reelId },
      include: { user: true },
    });

    if (reel && reel.userId !== userId) {
      io.to(`user:${reel.userId}`).emit("notification:new", {
        type: "LIKE",
        message: `${reel.user.name} liked your reel`,
        reelId,
      });
    }

    return { liked: true };
  }

  static async commentOnReel(reelId: string, userId: string, comment: string) {
    const reelComment = await prisma.reelComment.create({
      data: {
        reelId,
        userId,
        content: comment,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });

    await prisma.reel.update({
      where: { id: reelId },
      data: { commentsCount: { increment: 1 } },
    });

    // Notify reel owner
    const reel = await prisma.reel.findUnique({
      where: { id: reelId },
      include: { user: true },
    });

    if (reel && reel.userId !== userId) {
      io.to(`user:${reel.userId}`).emit("notification:new", {
        type: "COMMENT",
        message: `${reel.user.name} commented on your reel: "${comment.slice(0, 50)}${comment.length > 50 ? '...' : ''}"`,
        reelId,
      });
    }

    return reelComment;
  }

  static async deleteReel(reelId: string, userId: string) {
    const reel = await prisma.reel.findUnique({
      where: { id: reelId },
    });

    if (!reel) throw new Error("Reel not found");
    if (reel.userId !== userId) throw new Error("Unauthorized");

    await prisma.reel.delete({
      where: { id: reelId },
    });

    return { success: true };
  }
} 