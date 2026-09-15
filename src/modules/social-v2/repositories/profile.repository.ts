 // src/modules/social-v2/repositories/profile.repository.ts

import { prisma } from "../../../config/db";

export class ProfileRepository {
  static async findByUserId(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      include: {
        socialProfile: true,
      },
    });
  }

  static async findByUsername(username: string) {
    return prisma.socialProfile.findUnique({
      where: { username },
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

  static async update(userId: string, data: any) {
    return prisma.user.update({
      where: { id: userId },
      data,
      include: {
        socialProfile: true,
      },
    });
  }

  static async upsertProfile(userId: string, data: any) {
    return prisma.socialProfile.upsert({
      where: { userId },
      update: data,
      create: {
        userId,
        ...data,
      },
    });
  }

  static async incrementPostCount(userId: string) {
    return prisma.socialProfile.update({
      where: { userId },
      data: { postsCount: { increment: 1 } },
    });
  }

  static async decrementPostCount(userId: string) {
    return prisma.socialProfile.update({
      where: { userId },
      data: { postsCount: { decrement: 1 } },
    });
  }

  static async incrementFollowerCount(userId: string) {
    return prisma.socialProfile.update({
      where: { userId },
      data: { followersCount: { increment: 1 } },
    });
  }

  static async decrementFollowerCount(userId: string) {
    return prisma.socialProfile.update({
      where: { userId },
      data: { followersCount: { decrement: 1 } },
    });
  }

  static async incrementFollowingCount(userId: string) {
    return prisma.socialProfile.update({
      where: { userId },
      data: { followingCount: { increment: 1 } },
    });
  }

  static async decrementFollowingCount(userId: string) {
    return prisma.socialProfile.update({
      where: { userId },
      data: { followingCount: { decrement: 1 } },
    });
  }
}