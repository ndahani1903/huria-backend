// src/modules/social/social.routes.ts
import { Router } from 'express';
import { SocialController } from './social.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import multer from 'multer';

const router = Router();
const upload = multer({ dest: 'uploads/' });

// ============ STORIES ============
router.get('/stories', authMiddleware, SocialController.getStories);
router.post('/stories', authMiddleware, upload.single('media'), SocialController.createStory);
router.post('/stories/:storyId/like', authMiddleware, SocialController.likeStory);
router.post('/stories/:storyId/comment', authMiddleware, SocialController.commentOnStory);

// ============ POSTS (Global Feed) ============
router.get('/feed', authMiddleware, SocialController.getFeed);
router.post('/posts', authMiddleware, upload.single('media'), SocialController.createPost);
router.post('/posts/:postId/like', authMiddleware, SocialController.likePost);
router.post('/posts/:postId/comment', authMiddleware, SocialController.commentOnPost);

// ============ CHATS ============
router.post('/chat/send', authMiddleware, SocialController.sendMessage);
router.get('/chat/conversations', authMiddleware, SocialController.getChats);
router.get('/chat/messages/:userId', authMiddleware, SocialController.getMessages);
router.post('/chat/mark-read', authMiddleware, SocialController.markMessagesAsRead);

// ============ CONNECTIONS ============
router.post('/users/:userId/follow', authMiddleware, SocialController.followUser);
router.post('/connections/:connectionId/accept', authMiddleware, SocialController.acceptConnection);
router.get('/connections', authMiddleware, SocialController.getConnections);
router.get('/connections/pending', authMiddleware, SocialController.getPendingRequests);
router.get('/discover', authMiddleware, SocialController.getDiscoverPeople);

export default router;