 // src/modules/social-v2/repositories/reel.repository.ts

import { prisma } from "../../../config/db";

export class ReelRepository {
  static async create(data: any) {
    return prisma.reel.create({
      data,
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
  }

  static async findById(reelId: string) {
    return prisma.reel.findUnique({
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
        reelsLikes: true,
        reelsComments: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });
  }

  static async findByUserId(userId: string, skip: number, take: number) {
    return prisma.reel.findMany({
      where: { userId, visibility: "PUBLIC" },
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
      orderBy: { createdAt: "desc" },
      skip,
      take,
    });
  }

  static async incrementViews(reelId: string) {
    return prisma.reel.update({
      where: { id: reelId },
      data: { viewsCount: { increment: 1 } },
    });
  }

  static async incrementLikes(reelId: string) {
    return prisma.reel.update({
      where: { id: reelId },
      data: { likesCount: { increment: 1 } },
    });
  }

  static async decrementLikes(reelId: string) {
    return prisma.reel.update({
      where: { id: reelId },
      data: { likesCount: { decrement: 1 } },
    });
  }

  static async incrementComments(reelId: string) {
    return prisma.reel.update({
      where: { id: reelId },
      data: { commentsCount: { increment: 1 } },
    });
  }

  static async deleteReel(reelId: string) {
    return prisma.reel.delete({
      where: { id: reelId },
    });
  }

  static async getFeed(userId: string, skip: number, take: number) {
    // Get followed users
    const following = await prisma.follow.findMany({
      where: { followerId: userId, status: "ACCEPTED" },
      select: { followingId: true },
    });

    const followingIds = following.map((f) => f.followingId);

    return prisma.reel.findMany({
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
      take,
    });
  }

  static async toggleLike(reelId: string, userId: string) {
    const existing = await prisma.reelLike.findUnique({
      where: {
        reelId_userId: { reelId, userId },
      },
    });

    if (existing) {
      await prisma.reelLike.delete({
        where: { id: existing.id },
      });
      return { liked: false };
    }

    await prisma.reelLike.create({
      data: {
        reelId,
        userId,
      },
    });
    return { liked: true };
  }

  static async addComment(reelId: string, userId: string, content: string) {
    return prisma.reelComment.create({
      data: {
        reelId,
        userId,
        content,
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
  }

  static async getComments(reelId: string, skip: number, take: number) {
    return prisma.reelComment.findMany({
      where: { reelId },
      include: {
        user: {
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

  static async trackView(reelId: string, userId: string, watchTime: number) {
    const existing = await prisma.reelView.findFirst({
      where: { reelId, userId },
    });

    if (existing) {
      return prisma.reelView.update({
        where: { id: existing.id },
        data: {
          watchTime,
          completed: watchTime > 10,
        },
      });
    }

    return prisma.reelView.create({
      data: {
        reelId,
        userId,
        watchTime,
        completed: watchTime > 10,
      },
    });
  }
}