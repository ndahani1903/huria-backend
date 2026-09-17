// src/modules/auth/auth.service.ts

import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { prisma } from "../../config/db";
import redis from "../../config/redis";
import { Role } from "@prisma/client";
import { normalizeTZPhone } from "../../utils/phone";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../../utils/token.util";

export class AuthService {
  /**
   * ============================================================
   * REGISTER
   * ============================================================
   */

  static async register(
    data: any,
    isPasswordPreHashed: boolean = false
  ) {
    const {
      role,
      password,
      name,
      email,
      phone: phoneInput,

      businessName,
      businessType,
      merchantType,
      pickupAddress,
      pickupLat,
      pickupLng,

      licenseNumber,
      nidaNumber,
      vehicleType,
      vehiclePlate,
    } = data;

    /**
     * ----------------------------------------------------------
     * VALIDATION
     * ----------------------------------------------------------
     */

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

    if (!role) {
      throw new Error("Role is required");
    }

    const phone = normalizeTZPhone(phoneInput);
    const normalizedEmail = email.trim().toLowerCase();

    const allowedRoles = [
      "customer",
      "driver",
      "merchant",
      "admin",
    ];

    if (!allowedRoles.includes(role)) {
      throw new Error("Invalid role");
    }

    /**
     * ----------------------------------------------------------
     * DUPLICATE CHECK
     * ----------------------------------------------------------
     */

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          {
            email: normalizedEmail,
          },
          {
            phone,
          },
        ],
      },
    });

    if (existing) {
      throw new Error("User already exists");
    }

    /**
     * ----------------------------------------------------------
     * PASSWORD
     * ----------------------------------------------------------
     */

    let hashedPassword = password;

    if (!isPasswordPreHashed) {
      hashedPassword = await bcrypt.hash(
        password,
        12
      );
    }

    /**
     * ----------------------------------------------------------
     * EMAIL VERIFICATION TOKEN
     * ----------------------------------------------------------
     */

    const verifyToken = crypto
      .randomBytes(32)
      .toString("hex");

    /**
     * ----------------------------------------------------------
     * CREATE USER
     * ----------------------------------------------------------
     */

    const user = await prisma.user.create({
      data: {
        name,
        phone,
        email: normalizedEmail,
        password: hashedPassword,

        role: role as Role,

        verifyToken,
        verifyTokenExpires: new Date(
          Date.now() + 1000 * 60 * 60 * 24
        ),

        phoneVerified: false,
        phoneOTP: null,
        phoneOTPExpiresAt: null,
        phoneOTPAttempts: 0,
      },
    });

    let merchantId: string | null = null;
    let driverId: string | null = null;
    let savedMerchantType: string | null = null;

    /**
     * ----------------------------------------------------------
     * SEND PHONE OTP
     * ----------------------------------------------------------
     */

    try {
      const { OTPService } = await import(
        "../../services/otp.service"
      );

      await OTPService.sendPhoneOTP(
        user.id,
        phone
      );

      console.log(
        `📱 Phone OTP sent for user ${user.id}`
      );
    } catch (otpError) {
      console.error(
        "Failed to send phone OTP:",
        otpError
      );

      /**
       * Registration itself should not fail just because
       * the SMS provider failed.
       */
    }

    /**
     * ----------------------------------------------------------
     * MERCHANT
     * ----------------------------------------------------------
     */

    if (role === "merchant") {
      const merchant = await prisma.merchant.create({
        data: {
          userId: user.id,

          name,
          phone,

          businessName,
          businessType,

          merchantType:
            merchantType || "GENERAL_ECOMMERCE",

          pickupAddress,
          pickupLat,
          pickupLng,

          totalRevenue: 0,
        },
      });

      merchantId = merchant.id;
      savedMerchantType = merchant.merchantType;
    }

    /**
     * ----------------------------------------------------------
     * DRIVER
     * ----------------------------------------------------------
     */

    if (role === "driver") {
      const driver = await prisma.driver.create({
        data: {
          userId: user.id,

          name,
          phone,

          licenseNumber,
          nidaNumber,

          vehicleType,
          vehiclePlate,

          isActive: true,
          isBusy: false,

          totalDeliveries: 0,
          rating: 5.0,

          status: "available",

          totalEarnings: 0,
        },
      });

      driverId = driver.id;

      await redis.sadd(
        "drivers:available",
        driver.id
      );
    }

    /**
     * ----------------------------------------------------------
     * ACCESS TOKEN
     * ----------------------------------------------------------
     */

    const accessToken = signAccessToken({
      id: user.id,
      role: user.role,
      driverId,
      merchantType: savedMerchantType,
    });

    /**
     * ----------------------------------------------------------
     * REFRESH TOKEN
     * ----------------------------------------------------------
     */

    const refreshToken = signRefreshToken({
      id: user.id,
    });

    const refreshTokenHash = await bcrypt.hash(
      refreshToken,
      12
    );

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        refreshTokenHash,
      },
    });

    /**
     * ----------------------------------------------------------
     * RESPONSE
     * ----------------------------------------------------------
     */

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        merchantType: savedMerchantType,
      },

      accessToken,
      refreshToken,

      verifyToken,
    };
  }

  /**
   * ============================================================
   * LOGIN
   * ============================================================
   */

  static async login(
    phoneInput: string,
    password: string
  ) {
    /**
     * ----------------------------------------------------------
     * VALIDATION
     * ----------------------------------------------------------
     */

    if (!phoneInput) {
      throw new Error("Phone number is required");
    }

    if (!password) {
      throw new Error("Password is required");
    }

    const phone = normalizeTZPhone(phoneInput);

    /**
     * ----------------------------------------------------------
     * FIND USER
     * ----------------------------------------------------------
     */

    const user = await prisma.user.findUnique({
      where: {
        phone,
      },
    });

    if (!user) {
      throw new Error("Invalid credentials");
    }

    /**
     * ----------------------------------------------------------
     * ACCOUNT STATUS
     * ----------------------------------------------------------
     */

    if (user.status === "suspended") {
      throw new Error("Account is suspended");
    }

    if (user.status === "banned") {
      throw new Error("Account is banned");
    }

    if (user.deletedAt) {
      throw new Error("Account is unavailable");
    }

    /**
     * ----------------------------------------------------------
     * PASSWORD CHECK
     * ----------------------------------------------------------
     */

    const passwordValid = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordValid) {
      throw new Error("Invalid credentials");
    }

    /**
     * ----------------------------------------------------------
     * MERCHANT INFORMATION
     * ----------------------------------------------------------
     */

    let merchantId: string | null = null;
    let merchantType: string | null = null;

    if (user.role === "merchant") {
      const merchant =
        await prisma.merchant.findUnique({
          where: {
            userId: user.id,
          },

          select: {
            id: true,
            merchantType: true,
          },
        });

      merchantId = merchant?.id || null;

      merchantType =
        merchant?.merchantType ||
        "GENERAL_ECOMMERCE";
    }

    /**
     * ----------------------------------------------------------
     * DRIVER INFORMATION
     * ----------------------------------------------------------
     */

    let driverId: string | null = null;

    if (user.role === "driver") {
      const driver =
        await prisma.driver.findUnique({
          where: {
            userId: user.id,
          },
        });

      driverId = driver?.id || null;

      if (driverId && driver?.isActive) {
        await redis.sadd(
          "drivers:available",
          driverId
        );
      }
    }

    /**
     * ----------------------------------------------------------
     * ACCESS TOKEN
     * ----------------------------------------------------------
     */

    const accessToken = signAccessToken({
      id: user.id,
      role: user.role,

      driverId,
      merchantId,
      merchantType,
    });

    /**
     * ----------------------------------------------------------
     * REFRESH TOKEN
     * ----------------------------------------------------------
     */

    const refreshToken = signRefreshToken({
      id: user.id,
    });

    const refreshTokenHash = await bcrypt.hash(
      refreshToken,
      12
    );

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        refreshTokenHash,
      },
    });

    /**
     * ----------------------------------------------------------
     * RESPONSE
     * ----------------------------------------------------------
     */

    return {
      success: true,

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,

        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,

        merchantType,
      },

      accessToken,
      refreshToken,
    };
  }

  /**
   * ============================================================
   * REFRESH TOKEN
   * ============================================================
   */

  static async refresh(token: string) {
    if (!token) {
      throw new Error("Refresh token is required");
    }

    let payload: any;

    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new Error("Unauthorized");
    }

    if (!payload?.id) {
      throw new Error("Unauthorized");
    }

    /**
     * ----------------------------------------------------------
     * FIND USER
     * ----------------------------------------------------------
     */

    const user = await prisma.user.findUnique({
      where: {
        id: payload.id,
      },
    });

    if (!user || !user.refreshTokenHash) {
      throw new Error("Unauthorized");
    }

    /**
     * ----------------------------------------------------------
     * ACCOUNT STATUS
     * ----------------------------------------------------------
     */

    if (
      user.status === "suspended" ||
      user.status === "banned" ||
      user.deletedAt
    ) {
      throw new Error("Unauthorized");
    }

    /**
     * ----------------------------------------------------------
     * VERIFY REFRESH TOKEN
     * ----------------------------------------------------------
     */

    const valid = await bcrypt.compare(
      token,
      user.refreshTokenHash
    );

    if (!valid) {
      throw new Error("Unauthorized");
    }

    /**
     * ----------------------------------------------------------
     * LOAD MERCHANT
     * ----------------------------------------------------------
     */

    let merchantId: string | null = null;
    let merchantType: string | null = null;

    if (user.role === "merchant") {
      const merchant =
        await prisma.merchant.findUnique({
          where: {
            userId: user.id,
          },

          select: {
            id: true,
            merchantType: true,
          },
        });

      merchantId = merchant?.id || null;

      merchantType =
        merchant?.merchantType ||
        "GENERAL_ECOMMERCE";
    }

    /**
     * ----------------------------------------------------------
     * LOAD DRIVER
     * ----------------------------------------------------------
     */

    let driverId: string | null = null;

    if (user.role === "driver") {
      const driver =
        await prisma.driver.findUnique({
          where: {
            userId: user.id,
          },

          select: {
            id: true,
            isActive: true,
          },
        });

      driverId = driver?.id || null;

      if (driverId && driver?.isActive) {
        await redis.sadd(
          "drivers:available",
          driverId
        );
      }
    }

    /**
     * ----------------------------------------------------------
     * CREATE NEW ACCESS TOKEN
     * ----------------------------------------------------------
     */

    const accessToken = signAccessToken({
      id: user.id,
      role: user.role,

      driverId,
      merchantId,
      merchantType,
    });

    /**
     * ----------------------------------------------------------
     * ROTATE REFRESH TOKEN
     * ----------------------------------------------------------
     */

    const refreshToken = signRefreshToken({
      id: user.id,
    });

    const refreshTokenHash = await bcrypt.hash(
      refreshToken,
      12
    );

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        refreshTokenHash,
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * ============================================================
   * VERIFY ACCESS TOKEN
   * ============================================================
   */

  static async verifyToken(token: string) {
    if (!token) {
      throw new Error("Token is required");
    }

    try {
      const secret = process.env.JWT_SECRET;

      if (!secret) {
        throw new Error(
          "JWT_SECRET is not configured"
        );
      }

      return jwt.verify(token, secret);
    } catch {
      throw new Error("Invalid token");
    }
  }

  /**
   * ============================================================
   * LOGOUT
   * ============================================================
   */

  static async logout(userId: string) {
    if (!userId) {
      throw new Error("User ID is required");
    }

    await prisma.user.update({
      where: {
        id: userId,
      },

      data: {
        refreshTokenHash: null,
      },
    });

    return true;
  }

  /**
   * ============================================================
   * VERIFY EMAIL
   * ============================================================
   */

  static async verifyEmail(token: string) {
    if (!token) {
      throw new Error(
        "Verification token is required"
      );
    }

    const user = await prisma.user.findFirst({
      where: {
        verifyToken: token,

        verifyTokenExpires: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      throw new Error("Invalid or expired token");
    }

    await prisma.user.update({
      where: {
        id: user.id,
      },

      data: {
        emailVerified: true,
        emailVerifiedAt: new Date(),

        verifyToken: null,
        verifyTokenExpires: null,
      },
    });

    return true;
  }

  /**
   * ============================================================
   * FORGOT PASSWORD
   * ============================================================
   */

  static async forgotPassword(email: string) {
    if (!email) {
      throw new Error("Email is required");
    }

    const normalizedEmail =
      email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

    /**
     * IMPORTANT:
     *
     * Return the same generic result whether the account
     * exists or not.
     *
     * This prevents account/email enumeration.
     */

    if (!user) {
      return true;
    }

    const token = crypto
      .randomBytes(32)
      .toString("hex");

    const expiresAt = new Date(
      Date.now() + 60 * 60 * 1000
    );

    await prisma.user.update({
      where: {
        id: user.id,
      },

      data: {
        passwordResetToken: token,
        passwordResetExpires: expiresAt,
      },
    });

    /**
     * IMPORTANT:
     *
     * The controller/email service should send the reset
     * email containing the token.
     *
     * Do not expose this token in a production API response.
     */

    if (
      process.env.NODE_ENV !== "production"
    ) {
      return {
        success: true,
        token,
      };
    }

    return {
      success: true,
    };
  }

  /**
   * ============================================================
   * RESET PASSWORD
   * ============================================================
   */

  static async resetPassword(
    token: string,
    password: string
  ) {
    if (!token) {
      throw new Error(
        "Reset token is required"
      );
    }

    if (!password) {
      throw new Error(
        "New password is required"
      );
    }

    const user = await prisma.user.findFirst({
      where: {
        passwordResetToken: token,

        passwordResetExpires: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      throw new Error(
        "Invalid or expired reset token"
      );
    }

    const passwordHash = await bcrypt.hash(
      password,
      12
    );

    await prisma.user.update({
      where: {
        id: user.id,
      },

      data: {
        password: passwordHash,

        passwordResetToken: null,
        passwordResetExpires: null,

        /**
         * Invalidate existing refresh sessions after
         * a successful password reset.
         */
        refreshTokenHash: null,
      },
    });

    return true;
  }
}