 // src/modules/social-v2/social.constants.ts

/**
 * ============================================================
 * SOCIAL V2 CONSTANTS
 * Single source of truth for the entire social module.
 * ============================================================
 */

export const SOCIAL = {
  PAGINATION: {
    DEFAULT_PAGE: 1,
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 100,
    FEED_BATCH_SIZE: 20,
    MESSAGE_BATCH_SIZE: 50,
    COMMENT_BATCH_SIZE: 30,
  },

  CACHE: {
    USER_PROFILE_TTL: 60 * 10, // 10 min
    FEED_TTL: 60, // 1 min
    STORY_TTL: 30,
    TRENDING_TTL: 60 * 5,
    SEARCH_TTL: 60 * 5,
  },

  REDIS: {
    USER_ONLINE: "social:user:online:",
    USER_SOCKET: "social:user:socket:",
    FEED_CACHE: "social:feed:",
    STORY_CACHE: "social:story:",
    TRENDING: "social:trending",
    PRESENCE: "social:presence:",
    TYPING: "social:typing:",
    CONVERSATION: "social:conversation:",
    UNREAD: "social:unread:",
  },

  UPLOAD: {
    MAX_MEDIA_PER_POST: 10,
    MAX_MEDIA_PER_STORY: 1,
    MAX_MEDIA_PER_REEL: 1,

    MAX_IMAGE_SIZE: 10 * 1024 * 1024,
    MAX_VIDEO_SIZE: 100 * 1024 * 1024,

    ALLOWED_IMAGES: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/jpg",
    ],

    ALLOWED_VIDEOS: [
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ],
  },

  STORY: {
    EXPIRATION_HOURS: 24,
    MAX_VIEWERS_RETURNED: 100,
  },

  CHAT: {
    MAX_MESSAGE_LENGTH: 3000,
    MAX_ATTACHMENTS: 5,
  },

  POST: {
    MAX_CAPTION: 2200,
    MAX_HASHTAGS: 30,
    MAX_MENTIONS: 30,
    MAX_COMMENTS_PER_REQUEST: 30,
  },

  SEARCH: {
    DEFAULT_LIMIT: 20,
    MAX_LIMIT: 50,
  },

  REEL: {
    MIN_DURATION_SECONDS: 3,
    MAX_DURATION_SECONDS: 180,
  },

  NOTIFICATION: {
    MAX_FETCH: 100,
  },
};

/**
 * ============================================================
 * Feed Ranking
 * ============================================================
 */

export const FEED_SCORE = {
  FOLLOWING: 100,

  CLOSE_FRIEND: 80,

  VERIFIED: 20,

  MUTUAL_FRIEND: 25,

  POST_LIKED_BEFORE: 40,

  COMMENTED_BEFORE: 50,

  SAVED_BEFORE: 45,

  SHARED_BEFORE: 50,

  RECENT_POST: 40,

  TRENDING: 60,

  LOCATION_MATCH: 15,

  HAS_MEDIA: 15,

  HAS_VIDEO: 25,

  HAS_REEL: 35,

  PENALTY_REPORTED: -100,

  PENALTY_MUTED: -500,

  PENALTY_BLOCKED: -1000,
};

/**
 * ============================================================
 * Socket Events
 * ============================================================
 */

export const SOCKET_EVENTS = {
  CONNECT: "connect",

  DISCONNECT: "disconnect",

  USER_ONLINE: "user:online",

  USER_OFFLINE: "user:offline",

  JOIN: "social:join",

  LEAVE: "social:leave",

  TYPING: "chat:typing",

  STOP_TYPING: "chat:stopTyping",

  MESSAGE: "chat:message",

  MESSAGE_READ: "chat:read",

  NEW_POST: "post:new",

  NEW_COMMENT: "comment:new",

  NEW_LIKE: "post:like",

  STORY_VIEWED: "story:viewed",

  NEW_NOTIFICATION: "notification:new",

  PRESENCE: "presence:update",
};

/**
 * ============================================================
 * Notification Types
 * ============================================================
 */

export const NOTIFICATION_TYPES = {
  LIKE: "LIKE",

  COMMENT: "COMMENT",

  FOLLOW: "FOLLOW",

  REPLY: "REPLY",

  MENTION: "MENTION",

  SHARE: "SHARE",

  STORY: "STORY",

  MESSAGE: "MESSAGE",

  REPOST: "REPOST",
} as const;

/**
 * ============================================================
 * Feed Types
 * ============================================================
 */

export const FEED_TYPES = {
  FOR_YOU: "FOR_YOU",

  FOLLOWING: "FOLLOWING",

  TRENDING: "TRENDING",

  NEARBY: "NEARBY",
} as const;

/**
 * ============================================================
 * Privacy
 * ============================================================
 */

export const VISIBILITY = {
  PUBLIC: "PUBLIC",

  FOLLOWERS: "FOLLOWERS",

  PRIVATE: "PRIVATE",
} as const;

/**
 * ============================================================
 * Presence
 * ============================================================
 */

export const PRESENCE = {
  ONLINE: "ONLINE",

  OFFLINE: "OFFLINE",

  AWAY: "AWAY",
} as const;

/**
 * ============================================================
 * Limits
 * ============================================================
 */

export const RATE_LIMITS = {
  CREATE_POST_PER_HOUR: 50,

  CREATE_COMMENT_PER_HOUR: 500,

  SEND_MESSAGE_PER_MINUTE: 120,

  FOLLOW_PER_DAY: 500,

  STORY_UPLOAD_PER_DAY: 100,

  REEL_UPLOAD_PER_DAY: 50,
};