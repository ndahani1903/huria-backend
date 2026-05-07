import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from '../config/db';

const SECRET = process.env.JWT_SECRET as string;

// ✅ DEFINE THE AuthRequest INTERFACE
export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    merchantId?: string;
    driverId?: string;
  };
}

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;

    console.log("🔐 Auth header:", !!authHeader); // ✅ DEBUG

    if (!authHeader) {
      console.log("❌ No token provided");
      return res.status(401).json({ error: "No token provided" });
    }

    const parts = authHeader.split(" ");
    
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      console.log("❌ Invalid token format");
      return res.status(401).json({ error: "Invalid token format. Use: Bearer <token>" });
    }


    const token = parts[1];

     if (!token) {
      console.log("❌ Token is empty");
      return res.status(401).json({ error: "Token is empty" });
    }

    console.log("🔐 Verifying token...");
    
    const decoded = jwt.verify(token, SECRET) as { id: string; role: string; driverId?: string };
    
    console.log("✅ Token verified for user:", decoded.id);


    // Optional: Verify user still exists in database
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, role: true }
    });

    if (!user) {
      console.log("❌ User not found in database");
      return res.status(401).json({ error: "User no longer exists" });
    }

    // ✅ ATTACH USER TO REQUEST
    req.user = {
      id: decoded.id,
      role: decoded.role,
      driverId: decoded.driverId
     };

    console.log("✅ User attached to request:", req.user); // ✅ DEBUG

    next();
  } catch (error: any) {
    console.error("AUTH ERROR:", error.message);
  
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token" });
    }
    
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    
    return res.status(401).json({ error: "Invalid token" });
  }
};