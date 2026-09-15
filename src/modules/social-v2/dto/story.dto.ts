 // src/modules/social-v2/dto/story.dto.ts
import { z } from "zod";

export const CreateStoryDto = z.object({
  media: z.string().url(),
  caption: z.string().trim().max(300).optional(),
  privacy: z.enum(["PUBLIC", "FOLLOWERS", "CLOSE_FRIENDS"]).default("PUBLIC"),
});

export type CreateStoryInput = z.infer<typeof CreateStoryDto>;

export const StoryResponseDto = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  mediaUrl: z.string(),
  mediaType: z.string(),
  caption: z.string().nullable(),
  expiresAt: z.date(),
  viewsCount: z.number(),
  likesCount: z.number(),
  createdAt: z.date(),
  user: z.object({
    id: z.string().uuid(),
    name: z.string(),
    avatar: z.string().nullable(),
  }),
  isViewed: z.boolean().optional(),
  isLiked: z.boolean().optional(),
});

export type StoryResponse = z.infer<typeof StoryResponseDto>;