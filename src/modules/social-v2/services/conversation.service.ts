 // src/modules/social-v2/services/conversation.service.ts
import { prisma } from "../../../config/db";
import { ConversationRepository } from "../repositories/conversation.repository";
import { io } from "../../../server";

export class ConversationService {
  static async createDirectConversation(userId1: string, userId2: string) {
    // Check if users are connected (follow each other)
    const follow1 = await prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId: userId1, followingId: userId2 },
      },
    });

    const follow2 = await prisma.follow.findUnique({
      where: {
        followerId_followingId: { followerId: userId2, followingId: userId1 },
      },
    });

    if (!follow1 || !follow2 || follow1.status !== "ACCEPTED" || follow2.status !== "ACCEPTED") {
      throw new Error("You must be connected to start a conversation");
    }

    const conversation = await ConversationRepository.findOrCreateDirect(userId1, userId2);

    // Notify both users
    io.to(`user:${userId1}`).emit("conversation:created", {
      conversationId: conversation.id,
      with: userId2,
    });

    io.to(`user:${userId2}`).emit("conversation:created", {
      conversationId: conversation.id,
      with: userId1,
    });

    return conversation;
  }

  static async createGroupConversation(userId: string, participants: string[], title?: string) {
    // Validate participants
    const uniqueParticipants = [...new Set([userId, ...participants])];

    if (uniqueParticipants.length < 3) {
      throw new Error("Group conversation needs at least 3 participants");
    }

    // Check if all participants exist
    const users = await prisma.user.findMany({
      where: { id: { in: uniqueParticipants } },
      select: { id: true },
    });

    if (users.length !== uniqueParticipants.length) {
      throw new Error("Some participants do not exist");
    }

    const conversation = await prisma.conversation.create({
      data: {
        type: "GROUP",
        title: title || "Group Chat",
        members: {
          create: uniqueParticipants.map((participantId) => ({
            userId: participantId,
            isAdmin: participantId === userId,
          })),
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
      },
    });

    // Notify all participants
    for (const participant of uniqueParticipants) {
      io.to(`user:${participant}`).emit("conversation:created", {
        conversationId: conversation.id,
        type: "GROUP",
        title: conversation.title,
      });
    }

    return conversation;
  }

  static async getConversations(userId: string) {
    try {
      const conversations = await ConversationRepository.findUserConversations(userId);
      
      // Format conversations with additional info
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
          unreadCount: 0, // You can calculate this
          updatedAt: conv.updatedAt,
          createdAt: conv.createdAt,
        };
      });
    } catch (error) {
      console.error("Get conversations error:", error);
      return [];
    }
  }

  static async addMember(conversationId: string, userId: string, actorId: string) {
    const conversation = await ConversationRepository.findById(conversationId);
    if (!conversation) throw new Error("Conversation not found");

    // Check if actor is admin
    const actorMember = conversation.members.find((m: any) => m.userId === actorId);
    if (!actorMember || !actorMember.isAdmin) {
      throw new Error("Only admins can add members");
    }

    // Check if user is already a member
    const isMember = conversation.members.some((m: any) => m.userId === userId);
    if (isMember) throw new Error("User is already a member");

    const member = await ConversationRepository.addMember(conversationId, userId);

    // Notify all members
    for (const member of conversation.members) {
      io.to(`user:${member.userId}`).emit("conversation:member_added", {
        conversationId,
        userId,
        addedBy: actorId,
      });
    }

    io.to(`user:${userId}`).emit("conversation:created", {
      conversationId,
      type: conversation.type,
      title: conversation.title,
    });

    return member;
  }

  static async removeMember(conversationId: string, userId: string, actorId: string) {
    const conversation = await ConversationRepository.findById(conversationId);
    if (!conversation) throw new Error("Conversation not found");

    // Check if actor is admin
    const actorMember = conversation.members.find((m: any) => m.userId === actorId);
    if (!actorMember || !actorMember.isAdmin) {
      throw new Error("Only admins can remove members");
    }

    // Cannot remove self if only admin
    const adminMembers = conversation.members.filter((m: any) => m.isAdmin);
    if (adminMembers.length === 1 && adminMembers[0].userId === actorId && userId === actorId) {
      throw new Error("Cannot remove yourself as the only admin");
    }

    await ConversationRepository.removeMember(conversationId, userId);

    // Notify all members
    for (const member of conversation.members) {
      io.to(`user:${member.userId}`).emit("conversation:member_removed", {
        conversationId,
        userId,
        removedBy: actorId,
      });
    }

    io.to(`user:${userId}`).emit("conversation:left", {
      conversationId,
    });

    return { success: true };
  }

  static async leaveConversation(conversationId: string, userId: string) {
    const conversation = await ConversationRepository.findById(conversationId);
    if (!conversation) throw new Error("Conversation not found");

    // Check if user is a member
    const isMember = conversation.members.some((m: any) => m.userId === userId);
    if (!isMember) throw new Error("Not a member of this conversation");

    // Check if user is the only admin
    const adminMembers = conversation.members.filter((m: any) => m.isAdmin);
    if (adminMembers.length === 1 && adminMembers[0].userId === userId) {
      // Transfer admin to another member if possible
      const otherMember = conversation.members.find((m: any) => m.userId !== userId);
      if (otherMember) {
        await ConversationRepository.addMember(conversationId, otherMember.userId);
      } else {
        // Delete conversation if no other members
        await prisma.conversation.delete({ where: { id: conversationId } });
        return { success: true, deleted: true };
      }
    }

    await ConversationRepository.removeMember(conversationId, userId);

    // Notify all members
    for (const member of conversation.members) {
      io.to(`user:${member.userId}`).emit("conversation:member_left", {
        conversationId,
        userId,
      });
    }

    return { success: true };
  }
}