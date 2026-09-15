// src/modules/social-v2/social.validation.ts

import { z } from "zod";
import { SOCIAL } from "./social.constants";

/* ============================================================
   COMMON
============================================================ */

export const uuidSchema = z.string().uuid("Invalid ID.");

export const pageSchema = z.coerce
  .number()
  .int()
  .positive()
  .default(SOCIAL.PAGINATION.DEFAULT_PAGE);

export const limitSchema = z.coerce
  .number()
  .int()
  .positive()
  .max(SOCIAL.PAGINATION.MAX_LIMIT)
  .default(SOCIAL.PAGINATION.DEFAULT_LIMIT);

/* ============================================================
   POSTS
============================================================ */

export const createPostSchema = z.object({
  caption: z
    .string()
    .trim()
    .max(SOCIAL.POST.MAX_CAPTION)
    .optional(),

  visibility: z
    .enum([
      "PUBLIC",
      "FOLLOWERS",
      "PRIVATE",
    ])
    .default("PUBLIC"),

  location: z
    .string()
    .trim()
    .max(120)
    .optional(),
});

export const updatePostSchema = z.object({
  caption: z
    .string()
    .trim()
    .max(SOCIAL.POST.MAX_CAPTION)
    .optional(),

  visibility: z
    .enum([
      "PUBLIC",
      "FOLLOWERS",
      "PRIVATE",
    ])
    .optional(),

  location: z
    .string()
    .trim()
    .max(120)
    .optional(),
});

/* ============================================================
   COMMENTS
============================================================ */

export const createCommentSchema = z.object({
  postId: uuidSchema,

  content: z
    .string()
    .trim()
    .min(1)
    .max(1000),

  parentCommentId: uuidSchema.optional(),
});

/* ============================================================
   STORIES
============================================================ */

export const createStorySchema = z.object({
  caption: z
    .string()
    .trim()
    .max(300)
    .optional(),

  privacy: z
    .enum([
      "PUBLIC",
      "FOLLOWERS",
      "CLOSE_FRIENDS",
    ])
    .default("FOLLOWERS"),
});

/* ============================================================
   REELS
============================================================ */

export const createReelSchema = z.object({
  caption: z
    .string()
    .trim()
    .max(500)
    .optional(),
});

/* ============================================================
   FOLLOW
============================================================ */

export const followSchema = z.object({
  targetUserId: uuidSchema,
});

/* ============================================================
   PROFILE
============================================================ */

export const updateProfileSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9._]+$/)
    .optional(),

  bio: z
    .string()
    .trim()
    .max(250)
    .optional(),

  website: z
    .string()
    .trim()
    .url()
    .optional(),

  location: z
    .string()
    .trim()
    .max(120)
    .optional(),
});

/* ============================================================
   SEARCH
============================================================ */

export const searchSchema = z.object({
  q: z
    .string()
    .trim()
    .min(1)
    .max(100),

  page: pageSchema,

  limit: limitSchema,
});

/* ============================================================
   FEED
============================================================ */

export const feedSchema = z.object({
  page: pageSchema,

  limit: limitSchema,

  type: z
    .enum([
      "FOR_YOU",
      "FOLLOWING",
      "TRENDING",
      "NEARBY",
    ])
    .default("FOR_YOU"),
});

/* ============================================================
   CONVERSATIONS
============================================================ */

export const createDirectConversationSchema = z.object({
  userId: uuidSchema,
});

export const createGroupConversationSchema = z.object({
  participants: z
    .array(uuidSchema)
    .min(2, "A group must have at least 2 participants.")
    .max(20),

  title: z
    .string()
    .trim()
    .min(1)
    .max(100),
});

export const addConversationMemberSchema = z.object({
  userId: uuidSchema,
});

/* ============================================================
   MESSAGES
============================================================ */

export const sendMessageSchema = z.object({
  conversationId: uuidSchema,

  type: z
    .enum([
      "TEXT",
      "IMAGE",
      "VIDEO",
      "AUDIO",
      "FILE",
      "LOCATION",
    ])
    .default("TEXT"),

  content: z
    .string()
    .trim()
    .max(SOCIAL.CHAT.MAX_MESSAGE_LENGTH)
    .optional(),

  media: z
    .array(z.string().url())
    .max(SOCIAL.CHAT.MAX_ATTACHMENTS)
    .optional(),
}).superRefine((data, ctx) => {
  if (
    data.type === "TEXT" &&
    (!data.content || data.content.trim().length === 0)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Text messages require content.",
      path: ["content"],
    });
  }
});

/* ============================================================
   NOTIFICATIONS
============================================================ */

export const notificationQuerySchema = z.object({
  page: pageSchema,

  limit: limitSchema,
});

/* ============================================================
   PAGINATION
============================================================ */

export const paginationSchema = z.object({
  page: pageSchema,

  limit: limitSchema,
});

/* ============================================================
   PRESENCE
============================================================ */

export const presenceSchema = z.object({
  socketId: z
    .string()
    .trim()
    .min(1),
});

/* ============================================================
   RECOMMENDATIONS
============================================================ */

export const recommendationSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(100)
    .default(10),
});