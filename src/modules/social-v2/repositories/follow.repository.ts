// src/modules/social-v2/repositories/follow.repository.ts
import { prisma } from "../../../config/db";

export class FollowRepository {
  static async follow(followerId: string, followingId: string) {
    return prisma.follow.create({
      data: {
        followerId,
        followingId,
        status: "ACCEPTED",
      },
      include: {
        follower: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        following: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
    });
  }

  static async unfollow(followerId: string, followingId: string) {
    return prisma.follow.delete({
      where: {
        followerId_followingId: { followerId, followingId },
      },
    });
  }

  static async isFollowing(followerId: string, followingId: string) {
    const follow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId, followingId },
      },
    });
    return !!follow && follow.status === "ACCEPTED";
  }

  static async getFollowers(userId: string, skip: number, take: number) {
    return prisma.follow.findMany({
      where: {
        followingId: userId,
        status: "ACCEPTED",
      },
      include: {
        follower: {
          select: {
            id: true,
            name: true,
            avatar: true,
            verified: true,
          },
        },
      },
      skip,
      take,
    });
  }

  static async getFollowing(userId: string, skip: number, take: number) {
    return prisma.follow.findMany({
      where: {
        followerId: userId,
        status: "ACCEPTED",
      },
      include: {
        following: {
          select: {
            id: true,
            name: true,
            avatar: true,
            verified: true,
          },
        },
      },
      skip,
      take,
    });
  }

  static async getFollowCounts(userId: string) {
    const [followers, following] = await Promise.all([
      prisma.follow.count({
        where: { followingId: userId, status: "ACCEPTED" },
      }),
      prisma.follow.count({
        where: { followerId: userId, status: "ACCEPTED" },
      }),
    ]);

    return { followers, following };
  }
} 