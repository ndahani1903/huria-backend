// src/modules/users/user.controller.ts

import { Response } from "express";
import { AuthRequest } from "../../middleware/auth.middleware";
import { UserService } from "./user.service";
import { prisma } from "../../config/db";

function getParamString(
  value: string | string[] | undefined
): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }

  throw new Error("Missing route parameter");
}

export class UserController {

  // ============================================================
  // CURRENT USER
  // ============================================================

  static async me(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized"
        });
      }

      const data =
        await UserService.getProfile(
          req.user.id
        );

      return res.json(data);
    } catch (error: any) {
      console.error(
        "Get profile error:",
        error
      );

      return res.status(400).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // UPDATE CURRENT USER
  // ============================================================

  static async updateMe(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized"
        });
      }

      const {
        name,
        avatar,
        profileImage
      } = req.body;

      const data =
        await UserService.updateProfile(
          req.user.id,
          {
            name,
            avatar,
            profileImage
          }
        );

      return res.json(data);
    } catch (error: any) {
      console.error(
        "Update profile error:",
        error
      );

      return res.status(400).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // GET USER BY ID
  // ============================================================

  static async getUserById(
    req: AuthRequest,
    res: Response
  ) {
    try {
      const id =
        getParamString(req.params.id);

      const user =
        await prisma.user.findUnique({
          where: {
            id
          },

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
        return res.status(404).json({
          error: "User not found"
        });
      }

      return res.json(user);
    } catch (error: any) {
      console.error(
        "Get user by ID error:",
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // GET MULTIPLE USERS BY IDS
  // ============================================================

  static async getUsersByIds(
    req: AuthRequest,
    res: Response
  ) {
    try {
      const { ids } = req.body;

      if (
        !ids ||
        !Array.isArray(ids) ||
        ids.length === 0
      ) {
        return res.status(400).json({
          error: "User IDs required"
        });
      }

      const users =
        await prisma.user.findMany({
          where: {
            id: {
              in: ids
            }
          },

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

      return res.json(users);
    } catch (error: any) {
      console.error(
        "Get users by IDs error:",
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // GET PROFILE
  // ============================================================

  static async getProfile(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized"
        });
      }

      const data =
        await UserService.getProfile(
          req.user.id
        );

      return res.json(data);
    } catch (error: any) {
      console.error(
        "Get profile error:",
        error
      );

      return res.status(400).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // UPDATE PROFILE
  // ============================================================

  static async updateProfile(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized"
        });
      }

      const {
        name,
        avatar,
        profileImage
      } = req.body;

      const data =
        await UserService.updateProfile(
          req.user.id,
          {
            name,
            avatar,
            profileImage
          }
        );

      return res.json(data);
    } catch (error: any) {
      console.error(
        "Update profile error:",
        error
      );

      return res.status(400).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // CHANGE PASSWORD
  // ============================================================

  static async changePassword(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized"
        });
      }

      const {
        oldPassword,
        newPassword
      } = req.body;

      if (
        !oldPassword ||
        !newPassword
      ) {
        return res.status(400).json({
          error:
            "Both old and new password are required"
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          error:
            "New password must be at least 6 characters"
        });
      }

      const result =
        await UserService.changePassword(
          req.user.id,
          oldPassword,
          newPassword
        );

      return res.json(result);
    } catch (error: any) {
      console.error(
        "Change password error:",
        error
      );

      return res.status(400).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // GET NOTIFICATIONS
  // ============================================================

  static async getNotifications(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized"
        });
      }

      const limit =
        parseInt(
          req.query.limit as string
        ) || 50;

      const data =
        await UserService.getNotifications(
          req.user.id,
          limit
        );

      return res.json(data);
    } catch (error: any) {
      console.error(
        "Get notifications error:",
        error
      );

      return res.status(400).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // MARK NOTIFICATION AS READ
  // ============================================================

  static async markNotificationRead(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized"
        });
      }

      const id =
        getParamString(req.params.id);

      const data =
        await UserService.markNotificationRead(
          req.user.id,
          id
        );

      return res.json(data);
    } catch (error: any) {
      console.error(
        "Mark notification read error:",
        error
      );

      return res.status(400).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // MARK ALL NOTIFICATIONS AS READ
  // ============================================================

  static async markAllNotificationsRead(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized"
        });
      }

      const data =
        await UserService.markAllNotificationsRead(
          req.user.id
        );

      return res.json(data);
    } catch (error: any) {
      console.error(
        "Mark all notifications read error:",
        error
      );

      return res.status(400).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // GET ACTIVITY LOGS
  // ============================================================

  static async getActivityLogs(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized"
        });
      }

      const limit =
        parseInt(
          req.query.limit as string
        ) || 50;

      const data =
        await UserService.getActivityLogs(
          req.user.id,
          limit
        );

      return res.json(data);
    } catch (error: any) {
      console.error(
        "Get activity logs error:",
        error
      );

      return res.status(400).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // GET NOTIFICATION SETTINGS
  // ============================================================

  static async getNotificationSettings(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized"
        });
      }

      const data =
        await UserService.getNotificationSettings(
          req.user.id
        );

      return res.json(data);
    } catch (error: any) {
      console.error(
        "Get notification settings error:",
        error
      );

      return res.status(400).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // UPDATE NOTIFICATION SETTINGS
  // ============================================================

  static async updateNotificationSettings(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized"
        });
      }

      const data =
        await UserService.updateNotificationSettings(
          req.user.id,
          req.body
        );

      return res.json(data);
    } catch (error: any) {
      console.error(
        "Update notification settings error:",
        error
      );

      return res.status(400).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // SEND TEST NOTIFICATION
  // ============================================================

  static async sendTestNotification(
    req: AuthRequest,
    res: Response
  ) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized"
        });
      }

      const { type } = req.body;

      const data =
        await UserService.sendTestNotification(
          req.user.id,
          type || "order"
        );

      return res.json(data);
    } catch (error: any) {
      console.error(
        "Send test notification error:",
        error
      );

      return res.status(400).json({
        error: error.message
      });
    }
  }
}