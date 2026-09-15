 // src/modules/social-v2/repositories/feed.repository.ts
import { prisma } from "../../../config/db";

export class FeedRepository {
  static async getForYouFeed(userId: string, skip: number, take: number) {
    // Get followed users
    const following = await prisma.follow.findMany({
      where: { followerId: userId, status: "ACCEPTED" },
      select: { followingId: true },
    });

    const followingIds = following.map((f) => f.followingId);

    return prisma.socialPost.findMany({
      where: {
        deletedAt: null,
        visibility: "PUBLIC",
        OR: [
          { authorId: { in: followingIds } },
          { authorId: userId },
        ],
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            verified: true,
          },
        },
        media: true,
        likes: {
          where: { userId },
          select: { userId: true },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
      orderBy: [
        { likesCount: "desc" },
        { createdAt: "desc" },
      ],
      skip,
      take,
    });
  }

  static async getFollowingFeed(userId: string, skip: number, take: number) {
    const following = await prisma.follow.findMany({
      where: { followerId: userId, status: "ACCEPTED" },
      select: { followingId: true },
    });

    const followingIds = following.map((f) => f.followingId);

    if (followingIds.length === 0) {
      return [];
    }

    return prisma.socialPost.findMany({
      where: {
        deletedAt: null,
        authorId: { in: followingIds },
        visibility: "PUBLIC",
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            verified: true,
          },
        },
        media: true,
        likes: {
          where: { userId },
          select: { userId: true },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take,
    });
  }

  static async getTrendingFeed(userId: string, skip: number, take: number) {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    return prisma.socialPost.findMany({
      where: {
        deletedAt: null,
        visibility: "PUBLIC",
        createdAt: { gte: weekAgo },
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            verified: true,
          },
        },
        media: true,
        likes: {
          where: { userId },
          select: { userId: true },
        },
        _count: {
          select: {
            likes: true,
            comments: true,
          },
        },
      },
      orderBy: [
        { likesCount: "desc" },
        { commentsCount: "desc" },
        { createdAt: "desc" },
      ],
      skip,
      take,
    });
  }
}