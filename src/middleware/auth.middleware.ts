import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET as string;

// ✅ DEFINE THE AuthRequest INTERFACE
export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization;

    console.log("🔐 Auth header:", header); // ✅ DEBUG

    if (!header) {
      console.log("❌ No token provided");
      return res.status(401).json({ error: "No token provided" });
    }

    const token = header.split(" ")[1];
    console.log("🔐 Token:", token.substring(0, 20) + "..."); // ✅ DEBUG

    const decoded: any = jwt.verify(token, SECRET);
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