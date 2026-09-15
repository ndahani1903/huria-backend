// src/modules/social-v2/dto/post.dto.ts
import { z } from "zod";

export const CreatePostDto = z.object({
  caption: z.string().trim().max(2200).optional(),
  media: z.array(z.string().url()).min(1).max(10),
  visibility: z.enum(["PUBLIC", "FOLLOWERS", "PRIVATE"]).default("PUBLIC"),
  location: z.string().trim().max(120).optional(),
});

export type CreatePostInput = z.infer<typeof CreatePostDto>;

export const UpdatePostDto = z.object({
  caption: z.string().trim().max(2200).optional(),
  visibility: z.enum(["PUBLIC", "FOLLOWERS", "PRIVATE"]).optional(),
});

export type UpdatePostInput = z.infer<typeof UpdatePostDto>;

export const PostResponseDto = z.object({
  id: z.string().uuid(),
  authorId: z.string().uuid(),
  caption: z.string().nullable(),
  visibility: z.string(),
  likesCount: z.number(),
  commentsCount: z.number(),
  sharesCount: z.number(),
  savesCount: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
  isEdited: z.boolean(),
  allowComments: z.boolean(),
  allowSharing: z.boolean(),
  location: z.string().nullable(),
  author: z.object({
    id: z.string().uuid(),
    name: z.string(),
    username: z.string().optional(),
    avatar: z.string().nullable(),
    verified: z.boolean(),
  }),
  media: z.array(z.object({
    id: z.string().uuid(),
    url: z.string(),
    type: z.string(),
    width: z.number().nullable(),
    height: z.number().nullable(),
  })),
  isLiked: z.boolean().optional(),
  isSaved: z.boolean().optional(),
});

export type PostResponse = z.infer<typeof PostResponseDto>; 