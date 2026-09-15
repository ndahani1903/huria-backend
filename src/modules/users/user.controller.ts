import { Response } from "express";
import { AuthRequest } from "../../middleware/auth.middleware";
import { UserService } from "./user.service";
import { prisma } from "../../config/db";

export class UserController {
  static async me(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const data = await UserService.getMe(req.user.id);
      res.json(data);
    } catch (e: any) {
      console.error("Get profile error:", e);
      res.status(400).json({ error: e.message });
    }
  }

  static async updateMe(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const data = await UserService.updateMe(req.user.id, req.body);
      res.json(data);
    } catch (e: any) {
      console.error("Update profile error:", e);
      res.status(400).json({ error: e.message });
    }
  }

  // Get user by ID (for social features)
  static async getUserById(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      
      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          avatar: true,
          profileImage: true,
          emailVerified: true,
          role: true,
          createdAt: true
        }
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      res.json(user);
    } catch (error: any) {
      console.error("Get user by ID error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get multiple users by IDs (for chat list)
  static async getUsersByIds(req: AuthRequest, res: Response) {
    try {
      const { ids } = req.body;
      
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "User IDs required" });
      }

      const users = await prisma.user.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          avatar: true,
          profileImage: true,
          emailVerified: true,
          role: true,
          createdAt: true
        }
      });

      res.json(users);
    } catch (error: any) {
      console.error("Get users by IDs error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get profile
  static async getProfile(req: AuthRequest, res: Response) {
    try {
      const data = await UserService.getProfile(req.user.id);
      res.json(data);
    } catch (error: any) {
      console.error("Get profile error:", error);
      res.status(400).json({ error: error.message });
    }
  }

  // Update profile
  static async updateProfile(req: AuthRequest, res: Response) {
    try {
      const { name, avatar, profileImage } = req.body;
      const data = await UserService.updateProfile(req.user.id, { name, avatar, profileImage });
      res.json(data);
    } catch (error: any) {
      console.error("Update profile error:", error);
      res.status(400).json({ error: error.message });
    }
  }

  // Change password
  static async changePassword(req: AuthRequest, res: Response) {
    try {
      const { oldPassword, newPassword } = req.body;
      
      if (!oldPassword || !newPassword) {
        return res.status(400).json({ error: "Both old and new password are required" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ error: "New password must be at least 6 characters" });
      }

      const result = await UserService.changePassword(req.user.id, oldPassword, newPassword);
      res.json(result);
    } catch (error: any) {
      console.error("Change password error:", error);
      res.status(400).json({ error: error.message });
    }
  }

  // Get notifications
  static async getNotifications(req: AuthRequest, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const data = await UserService.getNotifications(req.user.id, limit);
      res.json(data);
    } catch (error: any) {
      console.error("Get notifications error:", error);
      res.status(400).json({ error: error.message });
    }
  }

  // Mark notification as read
  static async markNotificationRead(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const data = await UserService.markNotificationRead(req.user.id, id);
      res.json(data);
    } catch (error: any) {
      console.error("Mark notification read error:", error);
      res.status(400).json({ error: error.message });
    }
  }

  // Mark all notifications as read
  static async markAllNotificationsRead(req: AuthRequest, res: Response) {
    try {
      const data = await UserService.markAllNotificationsRead(req.user.id);
      res.json(data);
    } catch (error: any) {
      console.error("Mark all notifications read error:", error);
      res.status(400).json({ error: error.message });
    }
  }

  // Get activity logs
  static async getActivityLogs(req: AuthRequest, res: Response) {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const data = await UserService.getActivityLogs(req.user.id, limit);
      res.json(data);
    } catch (error: any) {
      console.error("Get activity logs error:", error);
      res.status(400).json({ error: error.message });
    }
  }

  // Get notification settings
  static async getNotificationSettings(req: AuthRequest, res: Response) {
    try {
      const data = await UserService.getNotificationSettings(req.user.id);
      res.json(data);
    } catch (error: any) {
      console.error("Get notification settings error:", error);
      res.status(400).json({ error: error.message });
    }
  }

  // Update notification settings
  static async updateNotificationSettings(req: AuthRequest, res: Response) {
    try {
      const data = await UserService.updateNotificationSettings(req.user.id, req.body);
      res.json(data);
    } catch (error: any) {
      console.error("Update notification settings error:", error);
      res.status(400).json({ error: error.message });
    }
  }

  // Send test notification
  static async sendTestNotification(req: AuthRequest, res: Response) {
    try {
      const { type } = req.body;
      const data = await UserService.sendTestNotification(req.user.id, type || 'order');
      res.json(data);
    } catch (error: any) {
      console.error("Send test notification error:", error);
      res.status(400).json({ error: error.message });
    }
  }
}