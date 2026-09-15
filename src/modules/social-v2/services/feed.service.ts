// src/modules/social-v2/services/feed.service.ts

import { prisma } from "../../../config/db";
import { FeedRepository } from "../repositories/feed.repository";
import { SocialCache } from "../utils/social-cache";
import { SOCIAL } from "../social.constants";
import { FeedType } from "../social.types";

export class FeedService {
  static async getFeed(
    userId: string,
    type: FeedType = "FOR_YOU",
    page: number = 1,
    limit: number = 20
  ) {
    const skip = (page - 1) * limit;
    const cacheKey = `feed:${userId}:${type}:${page}`;

    // Try cache first
    const cached = await SocialCache.getFeed(cacheKey);
    if (cached) {
      return cached;
    }

    let posts = [];

    try {
      switch (type) {
        case "FOR_YOU":
          posts = await this.getForYouFeed(userId, skip, limit);
          break;
        case "FOLLOWING":
          posts = await this.getFollowingFeed(userId, skip, limit);
          break;
        case "TRENDING":
          posts = await this.getTrendingFeed(userId, skip, limit);
          break;
        case "NEARBY":
          posts = await this.getTrendingFeed(userId, skip, limit);
          break;
        default:
          posts = await this.getForYouFeed(userId, skip, limit);
      }
    } catch (error) {
      console.error("Feed query error:", error);
      // Return empty array on error
      posts = [];
    }

    // Format posts with like status
    const formattedPosts = posts.map((post) => ({
      ...post,
      isLiked: post.likes?.length > 0 || false,
      likes: undefined,
    }));

    const result = {
      data: formattedPosts,
      pagination: {
        page,
        limit,
        hasMore: posts.length === limit,
      },
    };

    // Cache for 1 minute
    await SocialCache.set(cacheKey, result, SOCIAL.CACHE.FEED_TTL);

    return result;
  }

  static async getForYouFeed(userId: string, skip: number, limit: number) {
    // Get users the current user follows
    const following = await prisma.follow.findMany({
      where: {
        followerId: userId,
        status: "ACCEPTED",
      },
      select: {
        followingId: true,
      },
    });

    const followingIds = following.map((f) => f.followingId);

    // Build where clause - only include non-deleted posts
    const whereClause: any = {
      deletedAt: null, // ✅ Only include non-deleted posts
    };

    // For "FOR_YOU" feed: show posts from followed users AND popular public posts
    whereClause.OR = [
      { authorId: { in: followingIds } },
      { 
        visibility: "PUBLIC",
        // Optional: add popularity criteria
        // likesCount: { gte: 5 },
      },
    ];

    return prisma.socialPost.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            socialProfile: {
              select: {
                username: true,
                verified: true,
              },
            },
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
    });
  }

  static async getFollowingFeed(userId: string, skip: number, limit: number) {
    const following = await prisma.follow.findMany({
      where: {
        followerId: userId,
        status: "ACCEPTED",
      },
      select: {
        followingId: true,
      },
    });

    const followingIds = following.map((f) => f.followingId);

    if (followingIds.length === 0) {
      return [];
    }

    return prisma.socialPost.findMany({
      where: {
        authorId: { in: followingIds },
        deletedAt: null, // ✅ Only include non-deleted posts
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            socialProfile: {
              select: {
                username: true,
                verified: true,
              },
            },
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
    });
  }

  static async getTrendingFeed(userId: string, skip: number, limit: number) {
    return prisma.socialPost.findMany({
      where: {
        deletedAt: null, // ✅ Only include non-deleted posts
        visibility: "PUBLIC",
      },
      orderBy: [
        { likesCount: "desc" },
        { commentsCount: "desc" },
        { createdAt: "desc" },
      ],
      skip,
      take: limit,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            socialProfile: {
              select: {
                username: true,
                verified: true,
              },
            },
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
    });
  }

  static async refreshFeedCache(userId: string) {
    await SocialCache.delPattern(`feed:${userId}:*`);
    return { success: true };
  }
}