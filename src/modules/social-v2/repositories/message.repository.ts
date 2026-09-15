// src/modules/social-v2/repositories/message.repository.ts
import { prisma } from "../../../config/db";

export class MessageRepository {
  static async create(data: any) {
    return prisma.message.create({
      data,
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
    });
  }

  static async findConversationMessages(
    conversationId: string,
    skip: number,
    take: number
  ) {
    return prisma.message.findMany({
      where: {
        conversationId,
        isDeleted: false,
      },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
        attachments: true,
        reads: {
          select: {
            userId: true,
            readAt: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip,
      take,
    });
  }

  static async markAsRead(messageId: string, userId: string) {
    const existing = await prisma.messageRead.findUnique({
      where: {
        messageId_userId: { messageId, userId },
      },
    });

    if (!existing) {
      await prisma.messageRead.create({
        data: {
          messageId,
          userId,
        },
      });
    }

    return true;
  }

  static async markConversationAsRead(conversationId: string, userId: string) {
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isDeleted: false,
      },
      select: { id: true },
    });

    const messageIds = messages.map((m) => m.id);

    if (messageIds.length === 0) return;

    // Create read receipts in batch
    const reads = messageIds.map((messageId) => ({
      messageId,
      userId,
    }));

    await prisma.$transaction([
      prisma.messageRead.createMany({
        data: reads,
        skipDuplicates: true,
      }),
    ]);
  }

  static async getUnreadCount(conversationId: string, userId: string) {
    const messages = await prisma.message.findMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isDeleted: false,
      },
      include: {
        reads: {
          where: { userId },
        },
      },
    });

    return messages.filter((m) => m.reads.length === 0).length;
  }

  static async deleteMessage(messageId: string) {
    return prisma.message.update({
      where: { id: messageId },
      data: { isDeleted: true },
    });
  }
} 