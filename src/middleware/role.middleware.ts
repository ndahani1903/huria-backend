import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.middleware";

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    console.log("🔐 requireRole - User:", req.user);
    console.log("🔐 requireRole - Required roles:", roles);
    
    if (!req.user) {
      console.log("❌ requireRole - No user in request");
      return res.status(401).json({ error: "Unauthorized - No user" });
    }

    console.log("🔐 requireRole - User role:", req.user.role);
    
    if (!roles.includes(req.user.role)) {
      console.log(`❌ requireRole - Role ${req.user.role} not in ${roles}`);
      return res.status(403).json({ 
        error: "Forbidden - Insufficient permissions",
        required: roles,
        yourRole: req.user.role
      });
    }

    console.log("✅ requireRole - Access granted");
    next();
  };
};