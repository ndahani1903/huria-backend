// src/modules/social-v2/social.controller.ts

import { Request, Response } from "express";
import { PostService } from "./services/post.service";
import { StoryService } from "./services/story.service";
import { MessageService } from "./services/message.service";
import { ConversationService } from "./services/conversation.service";
import { FollowService } from "./services/follow.service";
import { FeedService } from "./services/feed.service";
import { NotificationService } from "./services/notification.service";
import { PresenceService } from "./services/presence.service";
import { ReelService } from "./services/reel.service";
import { SearchService } from "./services/search.service";
import { ProfileService } from "./services/profile.service";
import { SocialAuthRequest } from "./middleware/social-auth.middleware";

export class SocialController {
  // ============ POSTS ============
  static async createPost(req: SocialAuthRequest, res: Response) {
    try {
      const post = await PostService.createPost(req.userId!, req.body);
      res.status(201).json({ success: true, data: post });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getPost(req: SocialAuthRequest, res: Response) {
    try {
      const { postId } = req.params;
      const post = await PostService.getPost(postId, req.userId);
      res.json({ success: true, data: post });
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  }

  static async getUserPosts(req: SocialAuthRequest, res: Response) {
    try {
      const { userId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const posts = await PostService.getUserPosts(userId, page, limit);
      res.json({ success: true, ...posts });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async likePost(req: SocialAuthRequest, res: Response) {
    try {
      const { postId } = req.params;
      const result = await PostService.likePost(postId, req.userId!);
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // ============ STORIES ============
  static async createStory(req: SocialAuthRequest, res: Response) {
    try {
      const story = await StoryService.createStory(req.userId!, req.body);
      res.status(201).json({ success: true, data: story });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getStories(req: SocialAuthRequest, res: Response) {
    try {
      const stories = await StoryService.getFriendsStories(req.userId!);
      res.json({ success: true, data: stories });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async viewStory(req: SocialAuthRequest, res: Response) {
    try {
      const { storyId } = req.params;
      const result = await StoryService.viewStory(storyId, req.userId!);
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async likeStory(req: SocialAuthRequest, res: Response) {
    try {
      const { storyId } = req.params;
      const result = await StoryService.likeStory(storyId, req.userId!);
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // ============ REELS ============
  static async createReel(req: SocialAuthRequest, res: Response) {
    try {
      const reel = await ReelService.createReel(req.userId!, req.body);
      res.status(201).json({ success: true, data: reel });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getReelsFeed(req: SocialAuthRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const reels = await ReelService.getReelsFeed(req.userId!, page, limit);
      res.json({ success: true, ...reels });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getReel(req: SocialAuthRequest, res: Response) {
    try {
      const { reelId } = req.params;
      const reel = await ReelService.getReel(reelId, req.userId);
      res.json({ success: true, data: reel });
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  }

  static async likeReel(req: SocialAuthRequest, res: Response) {
    try {
      const { reelId } = req.params;
      const result = await ReelService.likeReel(reelId, req.userId!);
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async commentOnReel(req: SocialAuthRequest, res: Response) {
    try {
      const { reelId } = req.params;
      const { comment } = req.body;
      const result = await ReelService.commentOnReel(reelId, req.userId!, comment);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // ============ CONVERSATIONS ============
  static async createDirectConversation(req: SocialAuthRequest, res: Response) {
    try {
      const { userId } = req.body;
      const conversation = await ConversationService.createDirectConversation(
        req.userId!,
        userId
      );
      res.status(201).json({ success: true, data: conversation });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async createGroupConversation(req: SocialAuthRequest, res: Response) {
    try {
      const { participants, title } = req.body;
      const conversation = await ConversationService.createGroupConversation(
        req.userId!,
        participants,
        title
      );
      res.status(201).json({ success: true, data: conversation });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async addMember(req: SocialAuthRequest, res: Response) {
    try {
      const { conversationId } = req.params;
      const { userId } = req.body;
      const result = await ConversationService.addMember(
        conversationId,
        userId,
        req.userId!
      );
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async removeMember(req: SocialAuthRequest, res: Response) {
    try {
      const { conversationId, userId } = req.params;
      const result = await ConversationService.removeMember(
        conversationId,
        userId,
        req.userId!
      );
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async leaveConversation(req: SocialAuthRequest, res: Response) {
    try {
      const { conversationId } = req.params;
      const result = await ConversationService.leaveConversation(
        conversationId,
        req.userId!
      );
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // ============ MESSAGES ============
  static async sendMessage(req: SocialAuthRequest, res: Response) {
    try {
      const message = await MessageService.sendMessage(req.userId!, req.body);
      res.status(201).json({ success: true, data: message });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getConversations(req: SocialAuthRequest, res: Response) {
  try {
    const conversations = await ConversationService.getConversations(req.userId!);
    res.json({ success: true, data: conversations });
  } catch (error: any) {
    console.error("Get conversations error:", error);
    // Return empty array instead of error
    res.json({ success: true, data: [] });
  }
}

  static async getMessages(req: SocialAuthRequest, res: Response) {
    try {
      const { conversationId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const messages = await MessageService.getConversationMessages(
        conversationId,
        req.userId!,
        page,
        limit
      );
      res.json({ success: true, ...messages });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // ============ FOLLOW ============
  static async followUser(req: SocialAuthRequest, res: Response) {
    try {
      const { userId } = req.params;
      const result = await FollowService.followUser(req.userId!, userId);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async unfollowUser(req: SocialAuthRequest, res: Response) {
    try {
      const { userId } = req.params;
      await FollowService.unfollowUser(req.userId!, userId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getFollowers(req: SocialAuthRequest, res: Response) {
    try {
      const { userId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const followers = await FollowService.getFollowers(userId, page, limit);
      res.json({ success: true, ...followers });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getFollowing(req: SocialAuthRequest, res: Response) {
    try {
      const { userId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const following = await FollowService.getFollowing(userId, page, limit);
      res.json({ success: true, ...following });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getFollowCounts(req: SocialAuthRequest, res: Response) {
    try {
      const { userId } = req.params;
      const counts = await FollowService.getFollowCounts(userId);
      res.json({ success: true, ...counts });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // ============ FEED ============
  static async getFeed(req: SocialAuthRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const type = (req.query.type as string) || "FOR_YOU";
      const feed = await FeedService.getFeed(req.userId!, type as any, page, limit);
      res.json({ success: true, ...feed });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // ============ NOTIFICATIONS ============
  static async getNotifications(req: SocialAuthRequest, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const notifications = await NotificationService.getNotifications(
        req.userId!,
        page,
        limit
      );
      res.json({ success: true, ...notifications });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async markNotificationRead(req: SocialAuthRequest, res: Response) {
    try {
      const { notificationId } = req.params;
      const result = await NotificationService.markAsRead(notificationId, req.userId!);
      res.json({ success: true, data: result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async markAllNotificationsRead(req: SocialAuthRequest, res: Response) {
    try {
      const count = await NotificationService.markAllAsRead(req.userId!);
      res.json({ success: true, count });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getUnreadCount(req: SocialAuthRequest, res: Response) {
    try {
      const count = await NotificationService.getUnreadCount(req.userId!);
      res.json({ success: true, count });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // ============ PROFILE ============
  static async getProfile(req: SocialAuthRequest, res: Response) {
    try {
      const { userId } = req.params;
      const profile = await ProfileService.getProfile(userId, req.userId);
      res.json({ success: true, data: profile });
    } catch (error: any) {
      res.status(404).json({ error: error.message });
    }
  }

  static async updateProfile(req: SocialAuthRequest, res: Response) {
    try {
      const profile = await ProfileService.updateProfile(req.userId!, req.body);
      res.json({ success: true, data: profile });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getProfileStats(req: SocialAuthRequest, res: Response) {
    try {
      const { userId } = req.params;
      const stats = await ProfileService.getProfileStats(userId);
      res.json({ success: true, ...stats });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getOnlineFollowers(req: SocialAuthRequest, res: Response) {
    try {
      const { userId } = req.params;
      const online = await PresenceService.getOnlineFollowers(userId);
      res.json({ success: true, data: online });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getRecommendations(req: SocialAuthRequest, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const recommendations = await ProfileService.getRecommendedUsers(
        req.userId!,
        limit
      );
      res.json({ success: true, data: recommendations });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // ============ SEARCH ============
  static async search(req: SocialAuthRequest, res: Response) {
    try {
      const query = req.query.q as string;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      
      if (!query) {
        return res.status(400).json({ error: "Search query required" });
      }
      
      const results = await SearchService.searchAll({
        query,
        userId: req.userId!,
        page,
        limit,
      });
      res.json({ success: true, ...results });
    } catch (error: any) {
      console.error("Search error:", error);
    // ✅ Return empty results instead of error
    res.json({ 
      success: true, 
      users: [], 
      posts: [], 
      hashtags: [],
      pagination: { page: 1, limit: 20, hasMore: false }
    });
    }
  }

  static async getSearchHistory(req: SocialAuthRequest, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const history = await SearchService.getSearchHistory(req.userId!, limit);
      res.json({ success: true, data: history });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async clearSearchHistory(req: SocialAuthRequest, res: Response) {
    try {
      await SearchService.clearSearchHistory(req.userId!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getSearchSuggestions(req: SocialAuthRequest, res: Response) {
    try {
      const query = req.query.q as string;
      if (!query || query.length < 2) {
        return res.json({ success: true, data: { users: [], hashtags: [] } });
      }
      const suggestions = await SearchService.getSuggestions(req.userId!, query);
      res.json({ success: true, ...suggestions });
    } catch (error: any) {
      console.error("Get search suggestions error:", error);
    // ✅ Return empty suggestions instead of error
    res.json({ success: true, data: { users: [], hashtags: [] } });
    }
  }

  static async getTrendingHashtags(req: SocialAuthRequest, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const hashtags = await SearchService.getTrendingHashtags(limit);
      res.json({ success: true, data: hashtags });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // ============ PRESENCE ============
  static async setOnline(req: SocialAuthRequest, res: Response) {
    try {
      const socketId = req.body.socketId;
      if (!socketId) {
        return res.status(400).json({ error: "socketId required" });
      }
      await PresenceService.setOnline(req.userId!, socketId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async setAway(req: SocialAuthRequest, res: Response) {
    try {
      await PresenceService.setAway(req.userId!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getPresenceStatus(req: SocialAuthRequest, res: Response) {
    try {
      const { userId } = req.params;
      const status = await PresenceService.getPresenceStatus(userId);
      res.json({ success: true, data: status });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getOnlineUsers(req: SocialAuthRequest, res: Response) {
    try {
      const userIds = req.query.userIds as string;
      if (!userIds) {
        return res.status(400).json({ error: "userIds required" });
      }
      const ids = userIds.split(",");
      const online = await PresenceService.getOnlineUsers(ids);
      res.json({ success: true, data: online });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }


  // Add these missing methods to your SocialController class

// ============ POSTS - Additional Methods ============
static async deletePost(req: SocialAuthRequest, res: Response) {
  try {
    const { postId } = req.params;
    await PostService.deletePost(postId, req.userId!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

static async updatePost(req: SocialAuthRequest, res: Response) {
  try {
    const { postId } = req.params;
    const post = await PostService.updatePost(postId, req.userId!, req.body);
    res.json({ success: true, data: post });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ============ COMMENTS ============
static async addComment(req: SocialAuthRequest, res: Response) {
  try {
    const { postId } = req.params;
    const comment = await PostService.addComment(postId, req.userId!, req.body);
    res.status(201).json({ success: true, data: comment });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

static async getComments(req: SocialAuthRequest, res: Response) {
  try {
    const { postId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const comments = await PostService.getComments(postId, page, limit);
    res.json({ success: true, ...comments });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

static async deleteComment(req: SocialAuthRequest, res: Response) {
  try {
    const { commentId } = req.params;
    await PostService.deleteComment(commentId, req.userId!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

static async likeComment(req: SocialAuthRequest, res: Response) {
  try {
    const { commentId } = req.params;
    const result = await PostService.likeComment(commentId, req.userId!);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ============ STORIES - Additional ============
static async deleteStory(req: SocialAuthRequest, res: Response) {
  try {
    const { storyId } = req.params;
    await StoryService.deleteStory(storyId, req.userId!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ============ REELS - Additional ============
static async deleteReel(req: SocialAuthRequest, res: Response) {
  try {
    const { reelId } = req.params;
    await ReelService.deleteReel(reelId, req.userId!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ============ CONVERSATIONS - Additional ============
static async getConversation(req: SocialAuthRequest, res: Response) {
  try {
    const { conversationId } = req.params;
    const conversation = await ConversationService.getConversation(
      conversationId,
      req.userId!
    );
    res.json({ success: true, data: conversation });
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
}

static async deleteConversation(req: SocialAuthRequest, res: Response) {
  try {
    const { conversationId } = req.params;
    await ConversationService.deleteConversation(conversationId, req.userId!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ============ MESSAGES - Additional ============
static async deleteMessage(req: SocialAuthRequest, res: Response) {
  try {
    const { messageId } = req.params;
    await MessageService.deleteMessage(messageId, req.userId!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

static async markMessageRead(req: SocialAuthRequest, res: Response) {
  try {
    const { messageId } = req.params;
    await MessageService.markMessageAsRead(messageId, req.userId!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ============ FOLLOW - Additional ============
static async checkFollowStatus(req: SocialAuthRequest, res: Response) {
  try {
    const { userId } = req.params;
    const isFollowing = await FollowService.checkFollowStatus(req.userId!, userId);
    res.json({ success: true, isFollowing });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ============ PROFILE - Additional ============
static async getMyProfile(req: SocialAuthRequest, res: Response) {
  try {
    const profile = await ProfileService.getProfile(req.userId!, req.userId);
    res.json({ success: true, data: profile });
  } catch (error: any) {
    res.status(404).json({ error: error.message });
  }
}

// ============ NOTIFICATIONS - Additional ============
static async deleteNotification(req: SocialAuthRequest, res: Response) {
  try {
    const { notificationId } = req.params;
    await NotificationService.deleteNotification(notificationId, req.userId!);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

// ============ PRESENCE - Additional ============
static async setTyping(req: SocialAuthRequest, res: Response) {
  try {
    const { conversationId } = req.params;
    await PresenceService.setTyping(req.userId!, conversationId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}

static async stopTyping(req: SocialAuthRequest, res: Response) {
  try {
    const { conversationId } = req.params;
    await PresenceService.stopTyping(req.userId!, conversationId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
}
}