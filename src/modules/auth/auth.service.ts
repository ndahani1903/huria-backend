import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/db";
import redis from "../../config/redis";
import { Role } from "@prisma/client";
import { normalizeTZPhone  } from "../../utils/phone";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../utils/token.util";

export class AuthService {
  static async register(data: any) {
   const { role, password, name, email, phone: phoneInput,
        businessName, businessType,
        pickupAddress, pickupLat, pickupLng } = data;
   
   // ✅ Validate required fields
    if (!phoneInput) {
      throw new Error("Phone number is required");
    }
    if (!password) {
      throw new Error("Password is required");
    }
    if (!name) {
      throw new Error("Name is required");
    }
    if (!email) {
      throw new Error("Email is required");
    }

     const phone = normalizeTZPhone(phoneInput);

    const allowedRoles = ["customer", "driver", "merchant"];

    if (!allowedRoles.includes(role)) {
      throw new Error("Invalid role");
    }

    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ email: data.email }, { phone }],
      },
    });

    if (existing) throw new Error("User already exists");

    const hashed = await bcrypt.hash(password, 10);

   const verifyToken = crypto.randomBytes(32).toString("hex");

    const user = await prisma.user.create({
      data: {
        name,
        phone,
        email: email.toLowerCase(),
        password: hashed,
        role: role as Role,
        verifyToken,
        verifyTokenExpires: new Date(Date.now() + 1000 * 60 * 60 * 24)
      },
    });

    let merchantId = null;
    let driverId = null;

    if (role === "merchant") {
      const merchant = await prisma.merchant.create({
        data: {
          userId: user.id,
          name,
          phone,
          businessName,
          businessType,

          // ✅ SAVE PICKUP LOCATION
          pickupAddress,
          pickupLat,
          pickupLng,
          totalRevenue: 0,
        },
      });

      merchantId = merchant.id;
    }

    if (role === "driver") {
      const driver = await prisma.driver.create({
        data: {
          userId: user.id,
          name,
          phone,
          status: "available",
          totalEarnings: 0,
        },
      });

      driverId = driver.id;

      await redis.sadd("drivers:available", driver.id);
    }

   const accessToken = signAccessToken({
      id: user.id,
      role: user.role,
     driverId: driverId 
    });

    const refreshToken = signRefreshToken({
      id: user.id
    });

    const hash = await bcrypt.hash(refreshToken, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: hash }
    });

    return {
       user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      },
      accessToken,
      refreshToken,
      verifyToken
    };
  }

  static async login(phoneInput: string, password: string) {
    // ✅ Validate inputs
    if (!phoneInput) {
      throw new Error("Phone number is required");
    }
    if (!password) {
      throw new Error("Password is required");
    }
  
    const phone = normalizeTZPhone(phoneInput);

    const user = await prisma.user.findUnique({
      where: { phone }
    });

    if (!user) throw new Error("User not found");

    const valid = await bcrypt.compare(password, user.password);

    if (!valid) throw new Error("Invalid credentials");

    let merchantId = null;
    let driverId = null;

    if (user.role === "merchant") {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: user.id },
      });

      merchantId = merchant?.id || null;
    }

    if (user.role === "driver") {
      const driver = await prisma.driver.findUnique({
        where: { userId: user.id },
      });

      driverId = driver?.id || null;

      if (driverId) {
        await redis.sadd("drivers:available", driverId);
      }
    }

     const accessToken = signAccessToken({
      id: user.id,
      role: user.role,
     driverId: driverId 
    });

    const refreshToken = signRefreshToken({
      id: user.id
    });

    const hash = await bcrypt.hash(refreshToken, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: hash }
    });

    return {
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        emailVerified: user.emailVerified
      },
      accessToken,
      refreshToken
    };
  }


   static async refresh(token: string) {
    if (!token) {
      throw new Error("Refresh token is required");
    }

    const payload: any = verifyRefreshToken(token);

    const user = await prisma.user.findUnique({
      where: { id: payload.id }
    });

    if (!user || !user.refreshTokenHash) {
      throw new Error("Unauthorized");
    }

     const valid = await bcrypt.compare(
      token,
      user.refreshTokenHash
    );

    if (!valid) throw new Error("Unauthorized");
    
    let driverId = null;

if (user.role === "driver") {
  const driver = await prisma.driver.findUnique({
    where: { userId: user.id },
  });

  driverId = driver?.id || null;
}

    const accessToken = signAccessToken({
      id: user.id,
      role: user.role,
     driverId: driverId 
    });

    const refreshToken = signRefreshToken({
      id: user.id
    });

    const hash = await bcrypt.hash(refreshToken, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshTokenHash: hash }
    });

    return { accessToken, refreshToken };
  }

  static async verifyToken(token: string) {
    if (!token) {
      throw new Error("Token is required");
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string);
      return decoded;
    } catch (error) {
      throw new Error("Invalid token");
    }
  }

   static async logout(userId: string) {
    if (!userId) {
      throw new Error("User ID is required");
    }

    await prisma.user.update({
      where: { id: userId },
      data: { refreshTokenHash: null }
    });

    return true;
  }


   static async verifyEmail(token: string) {
    if (!token) {
      throw new Error("Verification token is required");
    }

    const user = await prisma.user.findFirst({
      where: {
        verifyToken: token,
        verifyTokenExpires: {
          gt: new Date()
        }
      }
  });

    if (!user) throw new Error("Invalid token");

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),
        verifyToken: null,
        verifyTokenExpires: null
      }
    });

   return true;
  }

  static async forgotPassword(email: string) {
    if (!email) {
      throw new Error("Email is required");
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) return true;

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

     await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordResetToken: token,
        passwordResetExpires: expiresAt
      }
    });

   return { success: true, token };
  }

 static async resetPassword(token: string, password: string) {
    if (!token) {
      throw new Error("Reset token is required");
    }
    if (!password) {
      throw new Error("New password is required");
    }

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,
        passwordResetExpires: {
          gt: new Date()
        }
      }
    });

    if (!user) throw new Error("Expired token");

    const hash = await bcrypt.hash(password, 12);

      await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hash,
        passwordResetToken: null,
        passwordResetExpires: null
      }
    });

 
    return true;
  }
}

 