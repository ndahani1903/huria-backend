 // src/modules/social-v2/middleware/social-auth.middleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface SocialAuthRequest extends Request {
  userId?: string;
  user?: {
    id: string;
    role: string;
  };
}

export const socialAuthMiddleware = (
  req: SocialAuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Invalid token format" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    req.userId = decoded.id;
    req.user = { id: decoded.id, role: decoded.role };

    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};