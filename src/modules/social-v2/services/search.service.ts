// src/modules/social-v2/services/search.service.ts

import { prisma } from "../../../config/db";
import { SocialCache } from "../utils/social-cache";
import { SOCIAL } from "../social.constants";

interface SearchOptions {
  query: string;
  userId: string;
  page: number;
  limit: number;
}

export class SearchService {
  static async searchAll(options: SearchOptions) {
    const { query, userId, page, limit } = options;
    const skip = (page - 1) * limit;
    const cacheKey = `search:${userId}:${query}:${page}`;

    // Check cache
    const cached = await SocialCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const [users, posts, hashtags] = await Promise.all([
        this.searchUsers(query, userId, skip, limit),
        this.searchPosts(query, userId, skip, limit),
        this.searchHashtags(query, skip, limit),
      ]);

      // Save search history
      await prisma.socialSearchHistory.create({
        data: {
          userId,
          query,
        },
      });

      const result = {
        users,
        posts,
        hashtags,
        pagination: {
          page,
          limit,
          hasMore: users.length === limit || posts.length === limit,
        },
      };

      // Cache for 5 minutes
      await SocialCache.set(cacheKey, result, SOCIAL.CACHE.SEARCH_TTL);

      return result;
    } catch (error) {
      console.error("Search error:", error);
      // Return empty results on error
      return {
        users: [],
        posts: [],
        hashtags: [],
        pagination: {
          page,
          limit,
          hasMore: false,
        },
      };
    }
  }

  static async searchUsers(query: string, userId: string, skip: number = 0, limit: number = 20) {
    try {
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { socialProfile: { username: { contains: query, mode: "insensitive" } } },
          ],
          NOT: { id: userId },
        },
        select: {
          id: true,
          name: true,
          avatar: true,
          // ✅ Remove 'verified' from here - it's on SocialProfile
          socialProfile: {
            select: {
              username: true,
              bio: true,
              followersCount: true,
              verified: true, // ✅ Verified is on SocialProfile, not User
            },
          },
          followers: {
            where: { followerId: userId, status: "ACCEPTED" },
            select: { id: true },
          },
        },
        skip,
        take: limit,
      });

      return users.map((user) => ({
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        verified: user.socialProfile?.verified || false,
        username: user.socialProfile?.username,
        bio: user.socialProfile?.bio,
        followersCount: user.socialProfile?.followersCount || 0,
        isFollowing: user.followers.length > 0,
      }));
    } catch (error) {
      console.error("Search users error:", error);
      return [];
    }
  }

  static async searchPosts(query: string, userId: string, skip: number = 0, limit: number = 20) {
    try {
      const posts = await prisma.socialPost.findMany({
        where: {
          OR: [
            { caption: { contains: query, mode: "insensitive" } },
          ],
          deletedAt: null,
          visibility: "PUBLIC",
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              avatar: true,
              // ✅ Remove 'verified' from here
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
        take: limit,
      });

      // Also search for posts by hashtag
      const hashtagPosts = await this.searchPostsByHashtag(query, userId, skip, limit);
      
      // Combine and deduplicate
      const allPosts = [...posts, ...hashtagPosts];
      const uniquePosts = Array.from(
        new Map(allPosts.map((post) => [post.id, post])).values()
      );

      return uniquePosts.map((post) => ({
        ...post,
        isLiked: post.likes && post.likes.length > 0,
        likes: undefined,
      }));
    } catch (error) {
      console.error("Search posts error:", error);
      return [];
    }
  }

  static async searchPostsByHashtag(query: string, userId: string, skip: number = 0, limit: number = 20) {
    try {
      const hashtagPattern = `#${query}`;
      
      const posts = await prisma.socialPost.findMany({
        where: {
          caption: { contains: hashtagPattern, mode: "insensitive" },
          deletedAt: null,
          visibility: "PUBLIC",
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              avatar: true,
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
        take: limit,
      });

      return posts.map((post) => ({
        ...post,
        isLiked: post.likes && post.likes.length > 0,
        likes: undefined,
      }));
    } catch (error) {
      console.error("Search posts by hashtag error:", error);
      return [];
    }
  }

  static async searchHashtags(query: string, skip: number = 0, limit: number = 20) {
    try {
      return prisma.hashtag.findMany({
        where: {
          name: { contains: query, mode: "insensitive" },
        },
        orderBy: {
          usageCount: "desc",
        },
        skip,
        take: limit,
      });
    } catch (error) {
      console.error("Search hashtags error:", error);
      return [];
    }
  }

  static async getTrendingHashtags(limit: number = 10) {
    try {
      return prisma.hashtag.findMany({
        orderBy: {
          usageCount: "desc",
        },
        take: limit,
      });
    } catch (error) {
      console.error("Get trending hashtags error:", error);
      return [];
    }
  }

  static async getSearchHistory(userId: string, limit: number = 10) {
    try {
      return prisma.socialSearchHistory.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          query: true,
          createdAt: true,
        },
        distinct: ["query"],
      });
    } catch (error) {
      console.error("Get search history error:", error);
      return [];
    }
  }

  static async clearSearchHistory(userId: string) {
    try {
      return prisma.socialSearchHistory.deleteMany({
        where: { userId },
      });
    } catch (error) {
      console.error("Clear search history error:", error);
      throw error;
    }
  }

  static async getSuggestions(userId: string, query: string) {
    try {
      // Get users to suggest
      const users = await prisma.user.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { socialProfile: { username: { contains: query, mode: "insensitive" } } },
          ],
          NOT: { id: userId },
        },
        take: 5,
        select: {
          id: true,
          name: true,
          avatar: true,
          // ✅ Remove 'verified' from here
          socialProfile: {
            select: {
              username: true,
              verified: true, // ✅ Verified is on SocialProfile
            },
          },
        },
      });

      // Get hashtag suggestions
      const hashtags = await prisma.hashtag.findMany({
        where: {
          name: { contains: query, mode: "insensitive" },
        },
        take: 5,
        select: {
          name: true,
          usageCount: true,
        },
      });

      // Format users with verified from socialProfile
      const formattedUsers = users.map((user) => ({
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        verified: user.socialProfile?.verified || false,
        username: user.socialProfile?.username,
      }));

      return {
        users: formattedUsers,
        hashtags: hashtags.map((h) => h.name),
      };
    } catch (error) {
      console.error("Get suggestions error:", error);
      return { users: [], hashtags: [] };
    }
  }
}