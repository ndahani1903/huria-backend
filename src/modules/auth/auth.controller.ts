import { Request, Response } from "express";
import { AuthService } from "./auth.service";

export class AuthController {
  static register = async (req: Request, res: Response) => {
    try {
      const data = await AuthService.register(req.body);
      res.json(data);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  };

  static login = async (req: Request, res: Response) => {
    try {
      const data = await AuthService.login(
        req.body.phone,
        req.body.password
      );
      res.json(data);
    } catch (e: any) {
      res.status(401).json({ error: e.message });
    }
  };

   static refresh = async (req: Request, res: Response) => {
    try {
      const data = await AuthService.refresh(
        req.body.refreshToken
      );
      res.json(data);
    } catch (e: any) {
      res.status(401).json({ error: e.message });
    }
  };

   static logout = async (req: Request, res: Response) => {
    await AuthService.logout(req.user.id);
    res.json({ success: true });
  };

  static verifyEmail = async (req: Request, res: Response) => {
    await AuthService.verifyEmail(req.body.token);
    res.json({ success: true });
  };

  static forgotPassword = async (
    req: Request,
    res: Response
  ) => {
  const token = await AuthService.forgotPassword(
      req.body.email
    );
    res.json({ success: true, token });
  };

  static resetPassword = async (
    req: Request,
    res: Response
  ) => {
 await AuthService.resetPassword(
      req.body.token,
      req.body.password
    );
    res.json({ success: true });
  };
}