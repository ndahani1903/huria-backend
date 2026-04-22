import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from '../config/db';

const SECRET = process.env.JWT_SECRET as string;

// ✅ DEFINE THE AuthRequest INTERFACE
export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    console.log("🔐 Auth header:", authHeader); // ✅ DEBUG

    if (!authHeader) {
      console.log("❌ No token provided");
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.split(" ")[1];
    console.log("🔐 Token:", token.substring(0, 20) + "..."); // ✅ DEBUG

    if (!token) {
      return res.status(401).json({ error: "Invalid token format" });
    }

    const decoded: any = jwt.verify(token, SECRET) as { id: string; role: string; driverId?: string };
    console.log("✅ Decoded token:", decoded); // ✅ DEBUG

    // ✅ VERY IMPORTANT LINE
    //(req as any).user = decoded;

    // ✅ ATTACH USER TO REQUEST
    req.user = {
      id: decoded.id,
      role: decoded.role,
    };

    console.log("✅ User attached to request:", req.user); // ✅ DEBUG

    next();
  } catch (error: any) {
    console.error("AUTH ERROR:", error.message);
    return res.status(401).json({ error: "Invalid token" });
  }
};