import { Response } from "express";
import { NotificationSettingsService } from "./notificationSettings.service";
import { AuthRequest } from "../../middleware/auth.middleware";

export class NotificationSettingsController {
  static async getSettings(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const settings = await NotificationSettingsService.getSettings(req.user.id);
      res.json(settings);
    } catch (error: any) {
      console.error("Get notification settings error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async updateSettings(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const settings = await NotificationSettingsService.updateSettings(req.user.id, req.body);
      res.json(settings);
    } catch (error: any) {
      console.error("Update notification settings error:", error);
      res.status(500).json({ error: error.message });
    }
  }
}