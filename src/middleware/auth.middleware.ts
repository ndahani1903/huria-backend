import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../config/db";

const SECRET = process.env.JWT_SECRET as string;

// ============================================================
// AUTH REQUEST
// ============================================================

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
    merchantId?: string;
    driverId?: string;
  };
}

// ============================================================
// AUTH MIDDLEWARE
// ============================================================

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    console.log("🔐 Auth header:", !!authHeader);

    if (!authHeader) {
      console.log("❌ No token provided");
      return res.status(401).json({
        error: "No token provided",
      });
    }

    const parts = authHeader.split(" ");

    if (parts.length !== 2 || parts[0] !== "Bearer") {
      console.log("❌ Invalid token format");

      return res.status(401).json({
        error: "Invalid token format. Use: Bearer <token>",
      });
    }

    const token = parts[1];

    if (!token) {
      console.log("❌ Token is empty");

      return res.status(401).json({
        error: "Token is empty",
      });
    }

    console.log("🔐 Verifying token...");

    const decoded = jwt.verify(token, SECRET) as {
      id: string;
      role: string;
      driverId?: string;
      merchantId?: string;
    };

    console.log("✅ Token verified for user:", decoded.id);

    // ========================================================
    // VERIFY USER STILL EXISTS
    // ========================================================

    const user = await prisma.user.findUnique({
      where: {
        id: decoded.id,
      },
      select: {
        id: true,
        role: true,
      },
    });

    if (!user) {
      console.log("❌ User not found in database");

      return res.status(401).json({
        error: "User no longer exists",
      });
    }

    // ========================================================
    // ATTACH USER TO REQUEST
    // ========================================================

    req.user = {
      id: decoded.id,
      role: decoded.role,
      driverId: decoded.driverId,
      merchantId: decoded.merchantId,
    };

    console.log("✅ User attached to request:", req.user);

    next();
  } catch (error: any) {
    console.error("AUTH ERROR:", error.message);

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        error: "Invalid token",
      });
    }

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Token expired",
      });
    }

    return res.status(401).json({
      error: "Invalid token",
    });
  }
};

// ============================================================
// PERMISSION MIDDLEWARE
// ============================================================

export const requirePermission = (permission: string) => {
  return async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: "Unauthorized",
        });
      }

      // ======================================================
      // LOAD USER + CUSTOM USER ROLE + PERMISSIONS
      // ======================================================

      const user = await prisma.user.findUnique({
        where: {
          id: req.user.id,
        },
        include: {
          userRole: {
            include: {
              permissions: true,
            },
          },
        },
      });

      if (!user) {
        return res.status(401).json({
          error: "User no longer exists",
        });
      }

      // ======================================================
      // EXTRACT PERMISSIONS
      // ======================================================

      const rolePermissions =
        user.userRole?.permissions.map((p) => p.name) || [];

      // ======================================================
      // CHECK PERMISSION
      // ======================================================

      const hasPermission =
        rolePermissions.includes("full_access") ||
        rolePermissions.includes(permission);

      if (!hasPermission) {
        return res.status(403).json({
          error: "Insufficient permissions",
        });
      }

      next();
    } catch (error: any) {
      console.error("PERMISSION ERROR:", error);

      return res.status(500).json({
        error: "Failed to verify permissions",
      });
    }
  };
};