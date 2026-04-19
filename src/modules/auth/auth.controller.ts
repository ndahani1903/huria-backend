import { Request, Response } from "express";
import { AuthService } from "./auth.service";

export class AuthController {
  static async register(req: Request, res: Response) {
    try {
      const { name, phone, email, password, role } = req.body;

      const user = await AuthService.register(name, phone, email, password, role);

      res.json(user);
    } catch (error: any) {
      console.error("REGISTER ERROR:", error.message);
      res.status(500).json({ error: error.message });
    }
  }

  static async login(req: Request, res: Response) {
    try {
      const { phone, password } = req.body;

      const data = await AuthService.login(phone, password);

     // ✅ RETURN EXACTLY WHAT SERVICE RETURNS
      res.json(data);
    } catch (error: any) {
      console.error("LOGIN ERROR:", error.message);
      res.status(401).json({ error: error.message });
    }
  }
}
