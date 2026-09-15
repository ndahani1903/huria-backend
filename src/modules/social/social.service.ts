// src/modules/social/social.service.ts

import { prisma } from '../../config/db';
import { io } from '../../server';

export class SocialService {
  
  // ============ STORIES ============
  
  static async createStory(userId: string, mediaUrl: string, mediaType: string, caption?: string) {
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    const story = await prisma.story.create({
      data: {
        userId,
        mediaUrl,
        mediaType,
        caption,
        expiresAt
      },
      include: {
        user: {
          select: { id: true, name: true, avatar: true }
        }
      }
    });
    
    // Notify followers
    const followers = await prisma.connection.findMany({
      where: { followingId: userId, status: 'accepted' },
      select: { followerId: true }
    });
    
    for (const f of followers) {
      io.to(`user:${f.followerId}`).emit('story:new', {
        storyId: story.id,
        userId: story.userId,
        userName: story.user.name
      });
    }
    
    return story;
  }
  
  static async getStories(userId: string) {
    // Get stories from followed users + user's own stories
    const connections = await prisma.connection.findMany({
      where: { 
        followerId: userId, 
        status: 'accepted' 
      },
      select: { followingId: true }
    });
    
    const followingIds = connections.map(c => c.followingId);
    followingIds.push(userId); // Include own stories
    
    const stories = await prisma.story.findMany({
      where: {
        userId: { in: followingIds },
        expiresAt: { gt: new Date() }
      },
      include: {
        user: {
          select: { id: true, name: true, avatar: true }
        },
        comments: {
          include: {
            user: { select: { id: true, name: true, avatar: true } }
          },
          orderBy: { createdAt: 'desc' },
          take: 5
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Group by user
    const groupedStories = stories.reduce((acc, story) => {
      if (!acc[story.userId]) {
        acc[story.userId] = {
          user: story.user,
          stories: []
        };
      }
      acc[story.userId].stories.push(story);
      return acc;
    }, {});
    
    return Object.values(groupedStories);
  }
  
  static async likeStory(userId: string, storyId: string) {
    const existing = await prisma.storyLike.findUnique({
      where: {
        storyId_userId: { storyId, userId }
      }
    });
    
    if (existing) {
      // Unlike
      await prisma.storyLike.delete({
        where: { id: existing.id }
      });
      await prisma.story.update({
        where: { id: storyId },
        data: { likes: { decrement: 1 } }
      });
      return { liked: false };
    } else {
      // Like
      await prisma.storyLike.create({
        data: { storyId, userId }
      });
      await prisma.story.update({
        where: { id: storyId },
        data: { likes: { increment: 1 } }
      });
      return { liked: true };
    }
  }
  
  static async commentOnStory(userId: string, storyId: string, comment: string) {
    const storyComment = await prisma.storyComment.create({
      data: {
        storyId,
        userId,
        comment
      },
      include: {
        user: {
          select: { id: true, name: true, avatar: true }
        }
      }
    });
    
    // Notify story owner
    const story = await prisma.story.findUnique({
      where: { id: storyId },
      select: { userId: true }
    });
    
    if (story && story.userId !== userId) {
      io.to(`user:${story.userId}`).emit('story:comment', {
        storyId,
        comment: storyComment,
        commenterName: storyComment.user.name
      });
    }
    
    return storyComment;
  }
  
  // ============ POSTS (Global Feed) ============
  
  static async createPost(userId: string, content: string, mediaUrl?: string, mediaType?: string) {
    const post = await prisma.post.create({
      data: {
        userId,
        content,
        mediaUrl,
        mediaType,
        isPublic: true
      },
      include: {
        user: {
          select: { id: true, name: true, avatar: true }
        }
      }
    });
    
    // Broadcast to all online users
    io.emit('post:new', post);
    
    return post;
  }
  
  // src/modules/social/social.service.ts - Fix the getGlobalFeed method

// src/modules/social/social.service.ts

static async getGlobalFeed(userId: string, page = 1, limit = 20) {
  try {
    const skip = (page - 1) * limit;
    
    const posts = await prisma.post.findMany({
      where: {
        isPublic: true
      },
      include: {
        user: {
          select: { id: true, name: true, avatar: true }
        },
        postComments: {  // ✅ Use 'postComments' (not 'comments')
          include: {
            user: { select: { id: true, name: true, avatar: true } }
          },
          orderBy: { createdAt: 'desc' },
          take: 3
        },
        postLikes: {  // ✅ Use 'postLikes' (not 'likesList')
          where: { userId },
          select: { userId: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    });
    
    // Format the response to match what the frontend expects
    const formattedPosts = posts.map(post => ({
      ...post,
      comments: post.postComments,  // Map for frontend compatibility
      likesList: post.postLikes,
      isLiked: post.postLikes.some(like => like.userId === userId)
    }));
    
    const total = await prisma.post.count({
      where: { isPublic: true }
    });
    
    return {
      posts: formattedPosts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    console.error('GetGlobalFeed error:', error);
    throw error;
  }
}
  
  static async likePost(userId: string, postId: string) {
    const existing = await prisma.postLike.findUnique({
      where: {
        postId_userId: { postId, userId }
      }
    });
    
    if (existing) {
      await prisma.postLike.delete({
        where: { id: existing.id }
      });
      await prisma.post.update({
        where: { id: postId },
        data: { likes: { decrement: 1 } }
      });
      return { liked: false };
    } else {
      await prisma.postLike.create({
        data: { postId, userId }
      });
      await prisma.post.update({
        where: { id: postId },
        data: { likes: { increment: 1 } }
      });
      return { liked: true };
    }
  }
  
  // src/modules/social/social.service.ts

static async commentOnPost(userId: string, postId: string, comment: string) {
  try {
    const postComment = await prisma.postComment.create({
      data: {
        postId,
        userId,
        comment
      },
      include: {
        user: {
          select: { id: true, name: true, avatar: true }
        }
      }
    });
    
    // ✅ Use 'commentCount' (not 'comments')
    await prisma.post.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 } }
    });
    
    // Notify post owner
    const post = await prisma.post.findUnique({
      where: { id: postId },
      select: { userId: true }
    });
    
    if (post && post.userId !== userId) {
      io.to(`user:${post.userId}`).emit('post:comment', {
        postId,
        comment: postComment,
        commenterName: postComment.user.name
      });
    }
    
    return postComment;
  } catch (error) {
    console.error('CommentOnPost error:', error);
    throw error;
  }
}
  
  // ============ CHAT MESSAGES ============
  
  static async sendMessage(senderId: string, receiverId: string, message: string) {
    // Check if users are connected
    const connection = await prisma.connection.findFirst({
      where: {
        OR: [
          { followerId: senderId, followingId: receiverId, status: 'accepted' },
          { followerId: receiverId, followingId: senderId, status: 'accepted' }
        ]
      }
    });
    
    if (!connection) {
      throw new Error('You are not connected with this user');
    }
    
    const chatMessage = await prisma.chatMessage.create({
      data: {
        senderId,
        receiverId,
        message
      },
      include: {
        sender: {
          select: { id: true, name: true, avatar: true }
        }
      }
    });
    
    // Real-time delivery
    io.to(`user:${receiverId}`).emit('message:new', chatMessage);
    
    return chatMessage;
  }
  
  static async getChats(userId: string) {
    // Get all conversations
    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { senderId: userId },
          { receiverId: userId }
        ]
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // Group by other user
    const conversations = {};
    for (const msg of messages) {
      const otherId = msg.senderId === userId ? msg.receiverId : msg.senderId;
      if (!conversations[otherId] || msg.createdAt > conversations[otherId].createdAt) {
        conversations[otherId] = msg;
      }
    }
    
    // Get user details
    const userIds = Object.keys(conversations);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, avatar: true, phone: true }
    });
    
    const userMap = users.reduce((acc, u) => ({ ...acc, [u.id]: u }), {});
    
    return Object.values(conversations).map(msg => ({
      user: userMap[msg.senderId === userId ? msg.receiverId : msg.senderId],
      lastMessage: msg.message,
      lastMessageAt: msg.createdAt,
      isRead: msg.isRead
    }));
  }
  
  static async getMessages(userId: string, otherUserId: string, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    
    const messages = await prisma.chatMessage.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: userId }
        ]
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit
    });
    
    // Mark as read
    await prisma.chatMessage.updateMany({
      where: {
        senderId: otherUserId,
        receiverId: userId,
        isRead: false
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });
    
    return messages.reverse();
  }

static async markMessagesAsRead(userId: string, senderId: string) {
  try {
    await prisma.chatMessage.updateMany({
      where: {
        senderId: senderId,
        receiverId: userId,
        isRead: false
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });
    
    return { success: true };
  } catch (error) {
    console.error('Mark messages as read error:', error);
    throw error;
  }
}
  
  // ============ CONNECTIONS ============
  
  static async followUser(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new Error('Cannot follow yourself');
    }
    
    const existing = await prisma.connection.findUnique({
      where: {
        followerId_followingId: { followerId, followingId }
      }
    });
    
    if (existing) {
      if (existing.status === 'blocked') {
        throw new Error('You have been blocked by this user');
      }
      throw new Error('Already following this user');
    }
    
    const connection = await prisma.connection.create({
      data: {
        followerId,
        followingId,
        status: 'pending'
      },
      include: {
        following: {
          select: { id: true, name: true, avatar: true }
        }
      }
    });
    
    // Notify the user
    io.to(`user:${followingId}`).emit('connection:request', {
      from: followerId,
      fromName: connection.following.name
    });
    
    return connection;
  }
  
  static async acceptConnection(connectionId: string, userId: string) {
    const connection = await prisma.connection.findUnique({
      where: { id: connectionId }
    });
    
    if (!connection || connection.followingId !== userId) {
      throw new Error('Connection not found or unauthorized');
    }
    
    if (connection.status !== 'pending') {
      throw new Error(`Connection is already ${connection.status}`);
    }
    
    const updated = await prisma.connection.update({
      where: { id: connectionId },
      data: { status: 'accepted' },
      include: {
        follower: {
          select: { id: true, name: true, avatar: true }
        }
      }
    });
    
    // Both become contacts
    await prisma.contact.createMany({
      data: [
        { userId: connection.followerId, contactId: connection.followingId },
        { userId: connection.followingId, contactId: connection.followerId }
      ]
    });
    
    // Notify both users
    io.to(`user:${connection.followerId}`).emit('connection:accepted', {
      connectionId,
      userId: connection.followingId,
      name: updated.follower.name
    });
    
    io.to(`user:${connection.followingId}`).emit('connection:accepted', {
      connectionId,
      userId: connection.followerId,
      name: updated.follower.name
    });
    
    return updated;
  }
  
  static async getConnections(userId: string) {
    const connections = await prisma.connection.findMany({
      where: {
        OR: [
          { followerId: userId, status: 'accepted' },
          { followingId: userId, status: 'accepted' }
        ]
      },
      include: {
        follower: {
          select: { id: true, name: true, avatar: true }
        },
        following: {
          select: { id: true, name: true, avatar: true }
        }
      }
    });
    
    return connections.map(conn => ({
      id: conn.id,
      user: conn.followerId === userId ? conn.following : conn.follower,
      connectedAt: conn.createdAt
    }));
  }
  

   static async getDiscoverPeople(userId: string) {
    const connections = await prisma.connection.findMany({
      where: {
        OR: [
          { followerId: userId },
          { followingId: userId }
        ]
      }
    });
    
    const connectedUserIds = new Set();
    connections.forEach(conn => {
      connectedUserIds.add(conn.followerId);
      connectedUserIds.add(conn.followingId);
    });
    
    return prisma.user.findMany({
      where: {
        id: { 
          notIn: Array.from(connectedUserIds) 
        },
        NOT: { id: userId }
      },
      select: {
        id: true,
        name: true,
        avatar: true
      },
      take: 20
    });
  }

  static async getPendingRequests(userId: string) {
    return prisma.connection.findMany({
      where: {
        followingId: userId,
        status: 'pending'
      },
      include: {
        follower: {
          select: { id: true, name: true, avatar: true }
        }
      }
    });
  }
}