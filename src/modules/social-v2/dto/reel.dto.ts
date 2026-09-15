// src/modules/social-v2/dto/reel.dto.ts
import { z } from "zod";

export const CreateReelDto = z.object({
  video: z.string().url(),
  thumbnail: z.string().url().optional(),
  caption: z.string().trim().max(500).optional(),
});

export type CreateReelInput = z.infer<typeof CreateReelDto>;

export const ReelResponseDto = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  videoUrl: z.string(),
  thumbnailUrl: z.string().nullable(),
  caption: z.string().nullable(),
  duration: z.number(),
  viewsCount: z.number(),
  likesCount: z.number(),
  commentsCount: z.number(),
  sharesCount: z.number(),
  createdAt: z.date(),
  user: z.object({
    id: z.string().uuid(),
    name: z.string(),
    avatar: z.string().nullable(),
    verified: z.boolean(),
  }),
  isLiked: z.boolean().optional(),
});

export type ReelResponse = z.infer<typeof ReelResponseDto>; 