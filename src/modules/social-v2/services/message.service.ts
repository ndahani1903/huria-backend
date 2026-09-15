// src/modules/social-v2/services/message.service.ts
import { MessageRepository } from "../repositories/message.repository";
import { ConversationRepository } from "../repositories/conversation.repository";
import { SendMessageInput } from "../dto/message.dto";
import { SocialSocket } from "../social.socket";
import { io } from "../../../server";

export class MessageService {
  static async sendMessage(senderId: string, input: SendMessageInput) {
    const { conversationId, type, content, media } = input;

    // Check if user is in conversation
    const conversation = await ConversationRepository.findById(conversationId);
    if (!conversation) throw new Error("Conversation not found");

    const isMember = conversation.members.some((m: any) => m.userId === senderId);
    if (!isMember) throw new Error("Not a member of this conversation");

    // Create message
    const message = await MessageRepository.create({
      conversationId,
      senderId,
      type,
      content: content || null,
      attachments: media
        ? {
            create: media.map((url: string) => ({
              url,
              type: "image",
            })),
          }
        : undefined,
    });

    // Update conversation last message
    await ConversationRepository.updateLastMessage(conversationId, message.id);

    // Get other members to notify
    const otherMembers = conversation.members.filter(
      (m: any) => m.userId !== senderId
    );

    // Send real-time notification
    for (const member of otherMembers) {
      SocialSocket.emitMessage(io, conversationId, {
        message,
        conversationId,
        senderId,
        receiverId: member.userId,
      });

      // Update unread count
      const unreadCount = await MessageRepository.getUnreadCount(
        conversationId,
        member.userId
      );

      io.to(`user:${member.userId}`).emit("unread:update", {
        conversationId,
        count: unreadCount,
      });
    }

    return message;
  }

  static async getConversationMessages(
    conversationId: string,
    userId: string,
    page: number = 1,
    limit: number = 50
  ) {
    const skip = (page - 1) * limit;

    // Check membership
    const conversation = await ConversationRepository.findById(conversationId);
    if (!conversation) throw new Error("Conversation not found");

    const isMember = conversation.members.some((m: any) => m.userId === userId);
    if (!isMember) throw new Error("Not a member of this conversation");

    // Mark messages as read
    await MessageRepository.markConversationAsRead(conversationId, userId);

    const messages = await MessageRepository.findConversationMessages(
      conversationId,
      skip,
      limit
    );

    return {
      data: messages.reverse(),
      pagination: {
        page,
        limit,
        hasMore: messages.length === limit,
      },
    };
  }

  static async getUserConversations(userId: string) {
    try {
      const conversations = await ConversationRepository.findUserConversations(userId);
      
      // Format conversations
      return conversations.map((conv) => {
        const otherMember = conv.members.find((m: any) => m.userId !== userId);
        const lastMessage = conv.messages[0] || null;

        return {
          id: conv.id,
          type: conv.type,
          title: conv.type === "DIRECT" ? otherMember?.user?.name : conv.title,
          imageUrl: conv.type === "DIRECT" ? otherMember?.user?.avatar : conv.imageUrl,
          members: conv.members,
          lastMessage,
          updatedAt: conv.updatedAt,
          createdAt: conv.createdAt,
        };
      });
    } catch (error) {
      console.error("Get user conversations error:", error);
      return [];
    }
  }


  static async deleteMessage(messageId: string, userId: string) {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { senderId: true },
    });

    if (!message) throw new Error("Message not found");
    if (message.senderId !== userId) throw new Error("Unauthorized");

    return MessageRepository.deleteMessage(messageId);
  }
} 