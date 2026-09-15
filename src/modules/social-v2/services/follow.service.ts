 // src/modules/social-v2/services/follow.service.ts
import { prisma } from "../../../config/db";
import { FollowRepository } from "../repositories/follow.repository";
import { SocialSocket } from "../social.socket";
import { io } from "../../../server";
import { NotificationService } from "./notification.service";

export class FollowService {
  static async followUser(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new Error("Cannot follow yourself");
    }

    // Check if already following
    const isFollowing = await FollowRepository.isFollowing(followerId, followingId);
    if (isFollowing) {
      throw new Error("Already following this user");
    }

    const follow = await FollowRepository.follow(followerId, followingId);

    // Create notification
    await NotificationService.createNotification({
      userId: followingId,
      actorId: followerId,
      type: "FOLLOW",
      title: "New Follower",
      body: `@${follow.follower.name} started following you`,
      entityId: follow.id,
    });

    // Send real-time notification
    io.to(`user:${followingId}`).emit("notification:new", {
      type: "FOLLOW",
      message: `${follow.follower.name} started following you`,
      userId: followerId,
    });

    // Update counts
    await prisma.socialProfile.update({
      where: { userId: followingId },
      data: { followersCount: { increment: 1 } },
    });

    await prisma.socialProfile.update({
      where: { userId: followerId },
      data: { followingCount: { increment: 1 } },
    });

    return follow;
  }

  static async unfollowUser(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new Error("Cannot unfollow yourself");
    }

    const isFollowing = await FollowRepository.isFollowing(followerId, followingId);
    if (!isFollowing) {
      throw new Error("Not following this user");
    }

    await FollowRepository.unfollow(followerId, followingId);

    // Update counts
    await prisma.socialProfile.update({
      where: { userId: followingId },
      data: { followersCount: { decrement: 1 } },
    });

    await prisma.socialProfile.update({
      where: { userId: followerId },
      data: { followingCount: { decrement: 1 } },
    });

    return { success: true };
  }

  static async getFollowers(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const followers = await FollowRepository.getFollowers(userId, skip, limit);

    return {
      data: followers.map((f) => f.follower),
      pagination: {
        page,
        limit,
        hasMore: followers.length === limit,
      },
    };
  }

  static async getFollowing(userId: string, page: number = 1, limit: number = 20) {
    const skip = (page - 1) * limit;
    const following = await FollowRepository.getFollowing(userId, skip, limit);

    return {
      data: following.map((f) => f.following),
      pagination: {
        page,
        limit,
        hasMore: following.length === limit,
      },
    };
  }

  static async getMutualFollowers(userId: string, targetUserId: string) {
    const userFollowers = await prisma.follow.findMany({
      where: { followingId: userId, status: "ACCEPTED" },
      select: { followerId: true },
    });

    const targetFollowers = await prisma.follow.findMany({
      where: { followingId: targetUserId, status: "ACCEPTED" },
      select: { followerId: true },
    });

    const userFollowerIds = new Set(userFollowers.map((f) => f.followerId));
    const mutualIds = targetFollowers
      .filter((f) => userFollowerIds.has(f.followerId))
      .map((f) => f.followerId);

    if (mutualIds.length === 0) return [];

    return prisma.user.findMany({
      where: { id: { in: mutualIds } },
      select: {
        id: true,
        name: true,
        avatar: true,
        verified: true,
        socialProfile: {
          select: {
            username: true,
          },
        },
      },
    });
  }
}