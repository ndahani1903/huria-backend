 // src/modules/social-v2/repositories/story.repository.ts
import { prisma } from "../../../config/db";

export class StoryRepository {
  static async create(data: any) {
    return prisma.socialStory.create({
      data,
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

  static async findActiveStories(userId: string) {
    const now = new Date();
    return prisma.socialStory.findMany({
      where: {
        userId,
        expiresAt: { gt: now },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        views: true,
        likes: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  static async findFriendsStories(userId: string) {
    const now = new Date();
    // Get followed users
    const following = await prisma.follow.findMany({
      where: { followerId: userId, status: "ACCEPTED" },
      select: { followingId: true },
    });

    const followingIds = following.map((f) => f.followingId);

    return prisma.socialStory.findMany({
      where: {
        userId: { in: [...followingIds, userId] },
        expiresAt: { gt: now },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        views: {
          where: { viewerId: userId },
        },
        likes: {
          where: { userId },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }

  static async findById(storyId: string) {
    return prisma.socialStory.findUnique({
      where: { id: storyId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        views: {
          include: {
            viewer: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
        likes: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
      },
    });
  }

  static async addView(storyId: string, viewerId: string) {
    return prisma.storyView.create({
      data: {
        storyId,
        viewerId,
      },
    });
  }

  static async toggleLike(storyId: string, userId: string) {
    const existing = await prisma.storyReaction.findUnique({
      where: {
        storyId_userId: { storyId, userId },
      },
    });

    if (existing) {
      await prisma.storyReaction.delete({
        where: { id: existing.id },
      });
      await prisma.socialStory.update({
        where: { id: storyId },
        data: { likesCount: { decrement: 1 } },
      });
      return { liked: false };
    } else {
      await prisma.storyReaction.create({
        data: {
          storyId,
          userId,
          reaction: "LIKE",
        },
      });
      await prisma.socialStory.update({
        where: { id: storyId },
        data: { likesCount: { increment: 1 } },
      });
      return { liked: true };
    }
  }

  static async deleteExpiredStories() {
    const now = new Date();
    return prisma.socialStory.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    });
  }
}