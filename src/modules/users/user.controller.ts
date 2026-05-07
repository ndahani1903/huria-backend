import { Response } from "express";
import { UserService } from "./user.service";
import { AuthRequest } from "../../middleware/auth.middleware";

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
}