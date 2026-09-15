// src/modules/social/social.controller.ts
import { Request, Response } from 'express';
import { SocialService } from './social.service';
import { AuthRequest } from '../../middleware/auth.middleware';

export class SocialController {
  
  // ============ STORIES ============
  static async getStories(req: AuthRequest, res: Response) {
    try {
      // ✅ Check if user exists
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const stories = await SocialService.getStories(req.user.id);
      res.json({ success: true, stories });
    } catch (error: any) {
      console.error('Get stories error:', error);
      res.status(400).json({ error: error.message });
    }
  }

  static async createStory(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { caption } = req.body;
      const file = (req as any).file;
      
      // ✅ Handle file upload
      let mediaUrl = req.body.mediaUrl || '';
      let mediaType = req.body.mediaType || 'image';
      
      if (file) {
        // File was uploaded via multer
        mediaUrl = `/uploads/${file.filename}`;
        mediaType = file.mimetype.startsWith('video') ? 'video' : 'image';
      } else if (req.body.mediaUrl) {
        // Media URL was provided directly (for cloud uploads)
        mediaUrl = req.body.mediaUrl;
        mediaType = req.body.mediaType || 'image';
      } else {
        return res.status(400).json({ error: 'Media file or URL is required' });
      }

      const story = await SocialService.createStory(req.user.id, mediaUrl, mediaType, caption);
      res.json({ success: true, story });
    } catch (error: any) {
      console.error('Create story error:', error);
      res.status(400).json({ error: error.message });
    }
  }

  static async likeStory(req: AuthRequest, res: Response) {
    try {
      const { storyId } = req.params;
      const result = await SocialService.likeStory(req.user.id, storyId);
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async commentOnStory(req: AuthRequest, res: Response) {
    try {
      const { storyId } = req.params;
      const { comment } = req.body;
      const result = await SocialService.commentOnStory(req.user.id, storyId, comment);
      res.json({ success: true, comment: result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // ============ POSTS ============
  static async getFeed(req: AuthRequest, res: Response) {
    try {
      // ✅ Check if user exists
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
     console.log('📝 User ID:', req.user.id);

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      
    console.log('📝 Page:', page, 'Limit:', limit);
    
    const feed = await SocialService.getGlobalFeed(req.user.id, page, limit);
    
    console.log('📝 Feed posts count:', feed.posts?.length || 0);

      res.json({ success: true, ...feed });
    } catch (error: any) {
      console.error('❌ Get feed error:', error.message);
    console.error('❌ Stack:', error.stack);
      res.status(400).json({ error: error.message });
    }
  }

  static async createPost(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { content, mediaType } = req.body;
      const file = (req as any).file;
      
      // ✅ Handle file upload
      let mediaUrl = req.body.mediaUrl || '';
      let finalMediaType = mediaType || 'image';
      
      if (file) {
        // File was uploaded via multer
        mediaUrl = `/uploads/${file.filename}`;
        finalMediaType = file.mimetype.startsWith('video') ? 'video' : 'image';
      } else if (req.body.mediaUrl) {
        // Media URL was provided directly (for cloud uploads)
        mediaUrl = req.body.mediaUrl;
        finalMediaType = mediaType || 'image';
      }
      // If no media, it's a text-only post - that's fine

      const post = await SocialService.createPost(req.user.id, content, mediaUrl, finalMediaType);
      res.json({ success: true, post });
    } catch (error: any) {
      console.error('Create post error:', error);
      res.status(400).json({ error: error.message });
    }
  }

  static async likePost(req: AuthRequest, res: Response) {
    try {
      const { postId } = req.params;
      const result = await SocialService.likePost(req.user.id, postId);
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async commentOnPost(req: AuthRequest, res: Response) {
    try {
      const { postId } = req.params;
      const { comment } = req.body;
      const result = await SocialService.commentOnPost(req.user.id, postId, comment);
      res.json({ success: true, comment: result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  // ============ CHATS ============
  static async sendMessage(req: AuthRequest, res: Response) {
    try {
      const { receiverId, message } = req.body;
      const result = await SocialService.sendMessage(req.user.id, receiverId, message);
      res.json({ success: true, message: result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getChats(req: AuthRequest, res: Response) {
    try {
      const chats = await SocialService.getChats(req.user.id);
      res.json({ success: true, chats });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getMessages(req: AuthRequest, res: Response) {
    try {
      const { userId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const messages = await SocialService.getMessages(req.user.id, userId, page, limit);
      res.json({ success: true, messages });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }


  static async markMessagesAsRead(req: AuthRequest, res: Response) {
  try {
    const { senderId } = req.body;
    if (!senderId) {
      return res.status(400).json({ error: 'Sender ID is required' });
    }
    
    await SocialService.markMessagesAsRead(req.user.id, senderId);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Mark messages as read error:', error);
    res.status(400).json({ error: error.message });
  }
}

  // ============ CONNECTIONS ============
  static async followUser(req: AuthRequest, res: Response) {
    try {
      const { userId } = req.params;
      const result = await SocialService.followUser(req.user.id, userId);
      res.json({ success: true, connection: result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async acceptConnection(req: AuthRequest, res: Response) {
    try {
      const { connectionId } = req.params;
      const result = await SocialService.acceptConnection(connectionId, req.user.id);
      res.json({ success: true, connection: result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getConnections(req: AuthRequest, res: Response) {
    try {
      const connections = await SocialService.getConnections(req.user.id);
      res.json({ success: true, connections });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getPendingRequests(req: AuthRequest, res: Response) {
    try {
      const requests = await SocialService.getPendingRequests(req.user.id);
      res.json({ success: true, requests });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }

  static async getDiscoverPeople(req: AuthRequest, res: Response) {
    try {
      const suggestions = await SocialService.getDiscoverPeople(req.user.id);
      res.json({ success: true, suggestions });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
}