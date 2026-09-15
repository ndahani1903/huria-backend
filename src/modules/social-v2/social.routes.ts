// src/modules/social-v2/social.routes.ts

import { Router } from "express";

import { SocialController } from "./social.controller";

import { socialAuthMiddleware } from "./middleware/social-auth.middleware";

import { rateLimits } from "./middleware/social-rate-limit.middleware";

import {
  uploadPostMedia,
  uploadStory,
  uploadReel,
} from "./middleware/upload-social.middleware";

import { validate } from "./middleware/validation.middleware";

import {
  createPostSchema,
  createCommentSchema,
  createStorySchema,
  createReelSchema,
  createDirectConversationSchema,
  createGroupConversationSchema,
  addConversationMemberSchema,
  sendMessageSchema,
  feedSchema,
  paginationSchema,
  notificationQuerySchema,
  searchSchema,
  updateProfileSchema,
  recommendationSchema,
  presenceSchema,
} from "./social.validation";

const router = Router();

/* ============================================================
   GLOBAL MIDDLEWARE
============================================================ */

router.use(socialAuthMiddleware);

/* ============================================================
   POSTS
============================================================ */

/**
 * Create Post
 * Multipart Form
 * media[]
 * caption
 * visibility
 * location
 */
router.post(
  "/posts",
  rateLimits.createPost,
  uploadPostMedia.array("media"),
  validate(createPostSchema),
  SocialController.createPost
);

/**
 * Get Single Post
 */
router.get(
  "/posts/:postId",
  SocialController.getPost
);

/**
 * Get User Posts
 */
router.get(
  "/users/:userId/posts",
  validate(paginationSchema),
  SocialController.getUserPosts
);

/**
 * Like / Unlike Post
 */
router.post(
  "/posts/:postId/like",
  rateLimits.createComment,
  SocialController.likePost
);

/**
 * Delete Post
 */
router.delete(
  "/posts/:postId",
  SocialController.deletePost
);

/**
 * Update Post
 */
router.patch(
  "/posts/:postId",
  validate(createPostSchema.partial()),
  SocialController.updatePost
);

/* ============================================================
   COMMENTS
============================================================ */

/**
 * Add Comment
 */
router.post(
  "/posts/:postId/comments",
  rateLimits.createComment,
  validate(createCommentSchema),
  SocialController.addComment
);

/**
 * Get Comments for a Post
 */
router.get(
  "/posts/:postId/comments",
  validate(paginationSchema),
  SocialController.getComments
);

/**
 * Delete Comment
 */
router.delete(
  "/comments/:commentId",
  SocialController.deleteComment
);

/**
 * Like / Unlike Comment
 */
router.post(
  "/comments/:commentId/like",
  rateLimits.createComment,
  SocialController.likeComment
);

/* ============================================================
   STORIES
============================================================ */

/**
 * Create Story
 * Multipart Form
 * media (single file)
 * caption
 * privacy
 */
router.post(
  "/stories",
  rateLimits.storyUpload,
  uploadStory.single("media"),
  validate(createStorySchema),
  SocialController.createStory
);

/**
 * Get Friends' Stories
 */
router.get(
  "/stories",
  SocialController.getStories
);

/**
 * View Story
 */
router.post(
  "/stories/:storyId/view",
  SocialController.viewStory
);

/**
 * Like / Unlike Story
 */
router.post(
  "/stories/:storyId/like",
  SocialController.likeStory
);

/**
 * Delete Story
 */
router.delete(
  "/stories/:storyId",
  SocialController.deleteStory
);

/* ============================================================
   REELS
============================================================ */

/**
 * Create Reel
 * Multipart Form
 * video (single file)
 * caption
 */
router.post(
  "/reels",
  rateLimits.reelUpload,
  uploadReel.single("video"),
  validate(createReelSchema),
  SocialController.createReel
);

/**
 * Get Reels Feed
 */
router.get(
  "/reels/feed",
  validate(paginationSchema),
  SocialController.getReelsFeed
);

/**
 * Get Single Reel
 */
router.get(
  "/reels/:reelId",
  SocialController.getReel
);

/**
 * Like / Unlike Reel
 */
router.post(
  "/reels/:reelId/like",
  SocialController.likeReel
);

/**
 * Comment on Reel
 */
router.post(
  "/reels/:reelId/comments",
  rateLimits.createComment,
  validate(createCommentSchema),
  SocialController.commentOnReel
);

/**
 * Delete Reel
 */
router.delete(
  "/reels/:reelId",
  SocialController.deleteReel
);

/* ============================================================
   CONVERSATIONS
============================================================ */

/**
 * Create Direct Conversation
 */
router.post(
  "/conversations/direct",
  validate(createDirectConversationSchema),
  SocialController.createDirectConversation
);

/**
 * Create Group Conversation
 */
router.post(
  "/conversations/group",
  validate(createGroupConversationSchema),
  SocialController.createGroupConversation
);

/**
 * Get User's Conversations
 */
router.get(
  "/conversations",
  SocialController.getConversations
);

/**
 * Get Single Conversation
 */
router.get(
  "/conversations/:conversationId",
  SocialController.getConversation
);

/**
 * Add Member to Group
 */
router.post(
  "/conversations/:conversationId/members",
  validate(addConversationMemberSchema),
  SocialController.addMember
);

/**
 * Remove Member from Group
 */
router.delete(
  "/conversations/:conversationId/members/:userId",
  SocialController.removeMember
);

/**
 * Leave Conversation
 */
router.post(
  "/conversations/:conversationId/leave",
  SocialController.leaveConversation
);

/**
 * Delete Conversation
 */
router.delete(
  "/conversations/:conversationId",
  SocialController.deleteConversation
);

/* ============================================================
   MESSAGES
============================================================ */

/**
 * Send Message
 */
router.post(
  "/messages",
  rateLimits.sendMessage,
  validate(sendMessageSchema),
  SocialController.sendMessage
);

/**
 * Get Messages in Conversation
 */
router.get(
  "/conversations/:conversationId/messages",
  validate(paginationSchema),
  SocialController.getMessages
);

/**
 * Delete Message
 */
router.delete(
  "/messages/:messageId",
  SocialController.deleteMessage
);

/**
 * Mark Message as Read
 */
router.post(
  "/messages/:messageId/read",
  SocialController.markMessageRead
);

/* ============================================================
   FOLLOW
============================================================ */

/**
 * Follow User
 */
router.post(
  "/users/:userId/follow",
  rateLimits.follow,
  SocialController.followUser
);

/**
 * Unfollow User
 */
router.delete(
  "/users/:userId/follow",
  rateLimits.follow,
  SocialController.unfollowUser
);

/**
 * Get Followers
 */
router.get(
  "/users/:userId/followers",
  validate(paginationSchema),
  SocialController.getFollowers
);

/**
 * Get Following
 */
router.get(
  "/users/:userId/following",
  validate(paginationSchema),
  SocialController.getFollowing
);

/**
 * Get Follow Counts
 */
router.get(
  "/users/:userId/follow/counts",
  SocialController.getFollowCounts
);

/**
 * Check if Following
 */
router.get(
  "/users/:userId/follow/status",
  SocialController.checkFollowStatus
);

/* ============================================================
   FEED
============================================================ */

/**
 * Get Feed
 */
router.get(
  "/feed",
  validate(feedSchema),
  SocialController.getFeed
);

/* ============================================================
   NOTIFICATIONS
============================================================ */

/**
 * Get Notifications
 */
router.get(
  "/notifications",
  validate(notificationQuerySchema),
  SocialController.getNotifications
);

/**
 * Get Unread Count
 */
router.get(
  "/notifications/unread/count",
  SocialController.getUnreadCount
);

/**
 * Mark Notification as Read
 */
router.post(
  "/notifications/:notificationId/read",
  SocialController.markNotificationRead
);

/**
 * Mark All Notifications as Read
 */
router.post(
  "/notifications/read/all",
  SocialController.markAllNotificationsRead
);

/**
 * Delete Notification
 */
router.delete(
  "/notifications/:notificationId",
  SocialController.deleteNotification
);

/* ============================================================
   PROFILE
============================================================ */

/**
 * Get User Profile
 */
router.get(
  "/users/:userId/profile",
  SocialController.getProfile
);

/**
 * Get Current User's Profile
 */
router.get(
  "/profile/me",
  SocialController.getMyProfile
);

/**
 * Update Profile
 */
router.patch(
  "/profile",
  validate(updateProfileSchema),
  SocialController.updateProfile
);

/**
 * Get Profile Stats
 */
router.get(
  "/users/:userId/profile/stats",
  SocialController.getProfileStats
);

/**
 * Get Online Followers
 */
router.get(
  "/users/:userId/online",
  SocialController.getOnlineFollowers
);

/**
 * Get Recommendations
 */
router.get(
  "/recommendations",
  validate(recommendationSchema),
  SocialController.getRecommendations
);

/* ============================================================
   SEARCH
============================================================ */

/**
 * Search All
 */
router.get(
  "/search",
  rateLimits.search,
  validate(searchSchema),
  SocialController.search
);

/**
 * Get Search History
 */
router.get(
  "/search/history",
  SocialController.getSearchHistory
);

/**
 * Clear Search History
 */
router.delete(
  "/search/history",
  SocialController.clearSearchHistory
);

/**
 * Get Search Suggestions
 */
router.get(
  "/search/suggestions",
  SocialController.getSearchSuggestions
);

/**
 * Get Trending Hashtags
 */
router.get(
  "/search/trending",
  SocialController.getTrendingHashtags
);

/* ============================================================
   PRESENCE
============================================================ */

/**
 * Set Online Status
 */
router.post(
  "/presence/online",
  validate(presenceSchema),
  SocialController.setOnline
);

/**
 * Set Away Status
 */
router.post(
  "/presence/away",
  SocialController.setAway
);

/**
 * Get Presence Status
 */
router.get(
  "/presence/users/:userId",
  SocialController.getPresenceStatus
);

/**
 * Get Online Users
 */
router.get(
  "/presence/online/users",
  SocialController.getOnlineUsers
);

/**
 * Set Typing Status
 */
router.post(
  "/conversations/:conversationId/typing",
  SocialController.setTyping
);

/**
 * Stop Typing
 */
router.delete(
  "/conversations/:conversationId/typing",
  SocialController.stopTyping
);

export default router;