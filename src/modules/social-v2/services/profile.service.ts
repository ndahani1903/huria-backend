// src/modules/social-v2/services/profile.service.ts

import { prisma } from "../../../config/db";
import { SocialCache } from "../utils/social-cache";
import { SOCIAL } from "../social.constants";
import { FollowRepository } from "../repositories/follow.repository";

export class ProfileService {
  static async getProfile(userId: string, viewerId?: string) {
    // Check cache first
    const cached = await SocialCache.getUser(userId);
    if (cached) {
      return cached;
    }

    const profile = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        avatar: true,
        emailVerified: true,
        socialProfile: {
          select: {
            username: true,
            bio: true,
            website: true,
            location: true,
            followersCount: true,
            followingCount: true,
            postsCount: true,
            verified: true,
          },
        },
        // Check if viewer follows this user
        followers: viewerId
          ? {
              where: { followerId: viewerId, status: "ACCEPTED" },
              select: { id: true },
            }
          : false,
      },
    });

    if (!profile) throw new Error("User not found");

    const result = {
      ...profile,
      isFollowing: viewerId ? profile.followers?.length > 0 : false,
      followers: undefined,
    };

    // Cache for 10 minutes
    await SocialCache.cacheUser(userId, result);

    return result;
  }

  static async updateProfile(userId: string, data: any) {
    const { username, bio, website, location, name, avatar } = data;

    // Check if username is taken
    if (username) {
      const existing = await prisma.socialProfile.findUnique({
        where: { username },
      });
      if (existing && existing.userId !== userId) {
        throw new Error("Username already taken");
      }
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name || undefined,
        avatar: avatar || undefined,
        socialProfile: {
          upsert: {
            update: {
              username: username || undefined,
              bio: bio || undefined,
              website: website || undefined,
              location: location || undefined,
            },
            create: {
              username: username || `user_${userId.slice(0, 8)}`,
              bio: bio || "",
              website: website || "",
              location: location || "",
            },
          },
        },
      },
      include: {
        socialProfile: true,
      },
    });

    // Invalidate cache
    await SocialCache.del(`user:${userId}`);

    return updatedUser;
  }

  static async getProfileStats(userId: string) {
    const [posts, followers, following] = await Promise.all([
      prisma.socialPost.count({
        where: { authorId: userId, deletedAt: null }, // ✅ Only non-deleted posts
      }),
      prisma.follow.count({
        where: { followingId: userId, status: "ACCEPTED" },
      }),
      prisma.follow.count({
        where: { followerId: userId, status: "ACCEPTED" },
      }),
    ]);

    return {
      postsCount: posts,
      followersCount: followers,
      followingCount: following,
    };
  }

  static async getRecommendedUsers(userId: string, limit: number = 10) {
    try {
      // Get users the viewer follows
      const following = await prisma.follow.findMany({
        where: { followerId: userId, status: "ACCEPTED" },
        select: { followingId: true },
      });

      const followingIds = following.map((f) => f.followingId);

      // Get users not followed by the viewer, with most followers first
      const users = await prisma.user.findMany({
        where: {
          AND: [
            { id: { not: userId } },
            { id: { notIn: followingIds } },
            {
              socialProfile: {
                isNot: null,
              },
            },
          ],
        },
        select: {
          id: true,
          name: true,
          avatar: true,
          socialProfile: {
            select: {
              username: true,
              verified: true,
              followersCount: true,
              bio: true,
            },
          },
          // Get follower count
          _count: {
            select: {
              followers: {
                where: { status: "ACCEPTED" },
              },
            },
          },
        },
        orderBy: {
          followers: {
            _count: "desc",
          },
        },
        take: limit,
      });

      // Format the response
      return users.map((user) => ({
        id: user.id,
        name: user.name,
        avatar: user.avatar,
        username: user.socialProfile?.username,
        verified: user.socialProfile?.verified || false,
        bio: user.socialProfile?.bio,
        followersCount: user._count.followers || 0,
        isFollowing: false,
      }));
    } catch (error) {
      console.error("Get recommendations error:", error);
      return [];
    }
  }

  static async searchUsers(query: string, limit: number = 10) {
    return prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { socialProfile: { username: { contains: query, mode: "insensitive" } } },
        ],
      },
      select: {
        id: true,
        name: true,
        avatar: true,
        socialProfile: {
          select: {
            username: true,
            followersCount: true,
            verified: true,
          },
        },
      },
      take: limit,
    });
  }
}