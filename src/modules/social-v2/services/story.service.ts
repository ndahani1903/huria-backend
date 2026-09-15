// src/modules/social-v2/services/story.service.ts
import { StoryRepository } from "../repositories/story.repository";
import { CreateStoryInput } from "../dto/story.dto";
import { SocialSocket } from "../social.socket";
import { io } from "../../../server";

export class StoryService {
  static async createStory(userId: string, input: CreateStoryInput) {
    const { media, caption, privacy } = input;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const story = await StoryRepository.create({
      userId,
      mediaUrl: media,
      mediaType: "image",
      caption,
      expiresAt,
      privacy,
    });

    // Notify followers
    const followers = await prisma.follow.findMany({
      where: { followingId: userId, status: "ACCEPTED" },
      select: { followerId: true },
    });

    for (const f of followers) {
      io.to(`user:${f.followerId}`).emit("story:new", {
        storyId: story.id,
        userId: story.userId,
        userName: story.user.name,
      });
    }

    return story;
  }

  static async getFriendsStories(userId: string) {
    return StoryRepository.findFriendsStories(userId);
  }

  static async viewStory(storyId: string, viewerId: string) {
    const story = await StoryRepository.findById(storyId);
    if (!story) throw new Error("Story not found");

    // Check if already viewed
    const existingView = await prisma.storyView.findUnique({
      where: {
        storyId_viewerId: { storyId, viewerId },
      },
    });

    if (!existingView) {
      await StoryRepository.addView(storyId, viewerId);
      await prisma.socialStory.update({
        where: { id: storyId },
        data: { viewsCount: { increment: 1 } },
      });
    }

    return { viewed: true };
  }

  static async likeStory(storyId: string, userId: string) {
    return StoryRepository.toggleLike(storyId, userId);
  }

  static async deleteExpiredStories() {
    const result = await StoryRepository.deleteExpiredStories();
    console.log(`🧹 Deleted ${result.count} expired stories`);
    return result;
  }
} 