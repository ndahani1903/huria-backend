 // src/modules/social-v2/services/post.service.ts
import { prisma } from "../../../config/db";
import { PostRepository } from "../repositories/post.repository";
import { CreatePostInput, UpdatePostInput } from "../dto/post.dto";
import { HashtagUtil } from "../utils/hashtag.util";
import { MentionUtil } from "../utils/mention.util";
import { SocialCache } from "../utils/social-cache";
import { SOCIAL } from "../social.constants";
import { SocialSocket } from "../social.socket";
import { io } from "../../../server";

export class PostService {
  static async createPost(userId: string, input: CreatePostInput) {
    const { caption, media, visibility, location } = input;

    // Extract hashtags and mentions
    const hashtags = caption ? HashtagUtil.extract(caption) : [];
    const mentions = caption ? MentionUtil.extract(caption) : [];

    // Create post
    const post = await PostRepository.create({
      authorId: userId,
      caption,
      visibility,
      location,
      media: {
        create: media.map((url) => ({
          url,
          type: "image",
        })),
      },
    });

    // Process hashtags
    if (hashtags.length > 0) {
      for (const tag of hashtags) {
        await prisma.hashtag.upsert({
          where: { name: tag },
          update: { usageCount: { increment: 1 } },
          create: { name: tag, usageCount: 1 },
        });
      }

      // Link hashtags to post
      await prisma.postHashtag.createMany({
        data: hashtags.map((tag) => ({
          postId: post.id,
          hashtagId: tag,
        })),
        skipDuplicates: true,
      });
    }

    // Process mentions
    if (mentions.length > 0) {
      const mentionedUsers = await prisma.user.findMany({
        where: {
          name: { in: mentions },
        },
        select: { id: true },
      });

      if (mentionedUsers.length > 0) {
        await prisma.postMention.createMany({
          data: mentionedUsers.map((user) => ({
            postId: post.id,
            mentionedUserId: user.id,
          })),
          skipDuplicates: true,
        });

        // Notify mentioned users
        for (const user of mentionedUsers) {
          io.to(`user:${user.id}`).emit("notification:new", {
            type: "MENTION",
            message: `${post.author.name} mentioned you in a post`,
            postId: post.id,
          });
        }
      }
    }

    // Clear feed cache
    await SocialCache.delPattern(`feed:*`);

    // Broadcast new post
    SocialSocket.emitPost(io, {
      postId: post.id,
      authorId: userId,
      caption,
    });

    return post;
  }

  static async getPost(postId: string, viewerId?: string) {
    const post = await PostRepository.findById(postId);
    if (!post) throw new Error("Post not found");

    // Check if viewer has liked
    let isLiked = false;
    let isSaved = false;

    if (viewerId) {
      const like = await prisma.socialPostLike.findUnique({
        where: {
          postId_userId: { postId, userId: viewerId },
        },
      });
      isLiked = !!like;

      const saved = await prisma.savedPost.findUnique({
        where: {
          socialProfileId_postId: {
            socialProfileId: viewerId,
            postId,
          },
        },
      });
      isSaved = !!saved;
    }

    return {
      ...post,
      isLiked,
      isSaved,
    };
  }

  static async getUserPosts(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const posts = await PostRepository.findUserPosts(userId, skip, limit);

    return {
      data: posts,
      pagination: {
        page,
        limit,
        hasMore: posts.length === limit,
      },
    };
  }

  static async likePost(postId: string, userId: string) {
    const existing = await prisma.socialPostLike.findUnique({
      where: {
        postId_userId: { postId, userId },
      },
    });

    if (existing) {
      await prisma.socialPostLike.delete({
        where: { id: existing.id },
      });
      await PostRepository.incrementViews(postId);
      return { liked: false };
    }

    await prisma.socialPostLike.create({
      data: {
        postId,
        userId,
        reaction: "LIKE",
      },
    });

    await prisma.socialPost.update({
      where: { id: postId },
      data: { likesCount: { increment: 1 } },
    });

    // Notify post author
    const post = await PostRepository.findById(postId);
    if (post && post.authorId !== userId) {
      io.to(`user:${post.authorId}`).emit("notification:new", {
        type: "LIKE",
        message: `${post.author.name} liked your post`,
        postId,
      });
    }

    return { liked: true };
  }

  static async deletePost(postId: string, userId: string) {
    const post = await PostRepository.findById(postId);
    if (!post) throw new Error("Post not found");
    if (post.authorId !== userId) throw new Error("Unauthorized");

    await PostRepository.softDelete(postId);
    await SocialCache.delPattern(`feed:*`);

    return { success: true };
  }
}