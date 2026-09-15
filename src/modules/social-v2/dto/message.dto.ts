 // src/modules/social-v2/dto/message.dto.ts
import { z } from "zod";

export const SendMessageDto = z.object({
  conversationId: z.string().uuid(),
  type: z.enum(["TEXT", "IMAGE", "VIDEO", "AUDIO", "FILE", "LOCATION"]).default("TEXT"),
  content: z.string().trim().min(1).max(3000).optional(),
  media: z.array(z.string().url()).max(5).optional(),
});

export type SendMessageInput = z.infer<typeof SendMessageDto>;

export const MessageResponseDto = z.object({
  id: z.string().uuid(),
  conversationId: z.string().uuid(),
  senderId: z.string().uuid(),
  type: z.string(),
  content: z.string().nullable(),
  isEdited: z.boolean(),
  isDeleted: z.boolean(),
  createdAt: z.date(),
  sender: z.object({
    id: z.string().uuid(),
    name: z.string(),
    avatar: z.string().nullable(),
  }),
  attachments: z.array(z.object({
    id: z.string().uuid(),
    url: z.string(),
    type: z.string(),
    size: z.number().nullable(),
  })),
});

export type MessageResponse = z.infer<typeof MessageResponseDto>;