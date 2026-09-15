// src/modules/social-v2/repositories/conversation.repository.ts

import { prisma } from "../../../config/db";

export class ConversationRepository {
  static async findOrCreateDirect(userId1: string, userId2: string) {
    // Check if conversation exists
    const existing = await prisma.conversation.findFirst({
      where: {
        type: "DIRECT",
        AND: [
          { members: { some: { userId: userId1 } } },
          { members: { some: { userId: userId2 } } },
        ],
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    if (existing) return existing;

    // Create new conversation
    return prisma.conversation.create({
      data: {
        type: "DIRECT",
        members: {
          create: [{ userId: userId1 }, { userId: userId2 }],
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
      },
    });
  }

  static async findUserConversations(userId: string) {
    return prisma.conversation.findMany({
      where: {
        members: {
          some: { userId },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: "desc",
      },
    });
  }

  static async findById(conversationId: string) {
    return prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 20,
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                avatar: true,
              },
            },
            attachments: true,
          },
        },
      },
    });
  }

  static async updateLastMessage(conversationId: string, messageId: string) {
    return prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageId: messageId,
        updatedAt: new Date(),
      },
    });
  }

  static async addMember(conversationId: string, userId: string) {
    return prisma.conversationMember.create({
      data: {
        conversationId,
        userId,
      },
    });
  }

  static async removeMember(conversationId: string, userId: string) {
    // ✅ Fix: Use the correct unique constraint name
    return prisma.conversationMember.delete({
      where: {
        // This should match your schema's @@unique([conversationId, userId])
        conversationId_userId: { conversationId, userId },
      },
    });
  }
}