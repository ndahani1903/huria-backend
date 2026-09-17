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

const BCRYPT_ROUNDS = 12;
const EMAIL_VERIFICATION_HOURS = 24;
const PASSWORD_RESET_MINUTES = 60;

const PUBLIC_REGISTRATION_ROLES = [
  "customer",
  "driver",
  "merchant",
] as const;

type PublicRegistrationRole =
  (typeof PUBLIC_REGISTRATION_ROLES)[number];

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function validatePassword(password: string): void {
  if (!password || typeof password !== "string") {
    throw new Error("Password is required");
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  if (password.length > 128) {
    throw new Error("Password is too long");
  }
}

function validateRegistrationRole(
  role: unknown
): asserts role is PublicRegistrationRole {
  if (
    typeof role !== "string" ||
    !PUBLIC_REGISTRATION_ROLES.includes(
      role as PublicRegistrationRole
    )
  ) {
    throw new Error("Invalid registration role");
  }
}

function isValidPreHashedPassword(password: string): boolean {
  /*
   * bcrypt hashes normally look like:
   * $2a$10$...
   * $2b$12$...
   * $2y$12$...
   */
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(
    password
  );
}

export class AuthService {
  /**
   * Creates a customer, driver or merchant account.
   *
   * `isPasswordPreHashed` is intended ONLY for the internal
   * complete-registration flow.
   *
   * Public registration can NEVER create an admin account.
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

    // ---------------------------------------------------------
    // Validate required fields
    // ---------------------------------------------------------

    if (!name || typeof name !== "string" || !name.trim()) {
      throw new Error("Name is required");
    }

    if (!email || typeof email !== "string") {
      throw new Error("Email is required");
    }

    if (!phoneInput) {
      throw new Error("Phone number is required");
    }

    if (!password || typeof password !== "string") {
      throw new Error("Password is required");
    }

    const normalizedName = name.trim();
    const normalizedEmail = normalizeEmail(email);
    const phone = normalizeTZPhone(phoneInput);

    if (!normalizedEmail.includes("@")) {
      throw new Error("Invalid email address");
    }

    // ---------------------------------------------------------
    // IMPORTANT:
    // Admin cannot be created through public registration.
    // ---------------------------------------------------------

    validateRegistrationRole(role);

    // ---------------------------------------------------------
    // Validate password
    // ---------------------------------------------------------

    if (isPasswordPreHashed) {
      if (!isValidPreHashedPassword(password)) {
        throw new Error("Invalid pre-hashed password");
      }
    } else {
      validatePassword(password);
    }

    // ---------------------------------------------------------
    // Check for existing account
    // ---------------------------------------------------------

    const existing = await prisma.user.findFirst({
      where: {
        OR: [
          { email: normalizedEmail },
          { phone },
        ],
      },
      select: {
        id: true,
        email: true,
        phone: true,
        deletedAt: true,
      },
    });

    if (existing) {
      throw new Error("User already exists");
    }

    // ---------------------------------------------------------
    // Password
    // ---------------------------------------------------------

    const hashedPassword = isPasswordPreHashed
      ? password
      : await bcrypt.hash(password, BCRYPT_ROUNDS);

    // ---------------------------------------------------------
    // Email verification token
    // ---------------------------------------------------------

    const verifyToken = crypto
      .randomBytes(32)
      .toString("hex");

    const verifyTokenExpires = new Date(
      Date.now() +
        1000 *
          60 *
          60 *
          EMAIL_VERIFICATION_HOURS
    );

    // ---------------------------------------------------------
    // Create user + role-specific record atomically
    // ---------------------------------------------------------

    const result = await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: {
            name: normalizedName,
            phone,
            email: normalizedEmail,
            password: hashedPassword,

            role: role as Role,

            emailVerified: false,
            emailVerifiedAt: null,

            phoneVerified: false,
            phoneOTP: null,
            phoneOTPExpiresAt: null,
            phoneOTPAttempts: 0,

            verifyToken,
            verifyTokenExpires,

            status: "active",
          },
        });

        let merchantId: string | null = null;
        let driverId: string | null = null;
        let savedMerchantType: string | null = null;

        // -----------------------------------------------------
        // Merchant
        // -----------------------------------------------------

        if (role === "merchant") {
          if (
            !businessName ||
            typeof businessName !== "string" ||
            !businessName.trim()
          ) {
            throw new Error(
              "Business name is required for merchant registration"
            );
          }

          const merchant =
            await tx.merchant.create({
              data: {
                userId: user.id,
                name: normalizedName,
                phone,

                businessName:
                  businessName.trim(),

                businessType:
                  businessType || null,

                merchantType:
                  merchantType ||
                  "GENERAL_ECOMMERCE",

                pickupAddress:
                  pickupAddress || null,

                pickupLat:
                  pickupLat ?? null,

                pickupLng:
                  pickupLng ?? null,

                totalRevenue: 0,
              },
            });

          merchantId = merchant.id;
          savedMerchantType =
            merchant.merchantType;
        }

        // -----------------------------------------------------
        // Driver
        // -----------------------------------------------------

        if (role === "driver") {
          if (
            !licenseNumber ||
            typeof licenseNumber !== "string" ||
            !licenseNumber.trim()
          ) {
            throw new Error(
              "License number is required for driver registration"
            );
          }

          const driver =
            await tx.driver.create({
              data: {
                userId: user.id,
                name: normalizedName,
                phone,

                licenseNumber:
                  licenseNumber.trim(),

                nidaNumber:
                  nidaNumber || null,

                vehicleType:
                  vehicleType || null,

                vehiclePlate:
                  vehiclePlate || null,

                isActive: true,
                isBusy: false,

                totalDeliveries: 0,

                rating: 5.0,

                status: "available",

                totalEarnings: 0,
              },
            });

          driverId = driver.id;
        }

        return {
          user,
          merchantId,
          driverId,
          savedMerchantType,
        };
      }
    );

    // ---------------------------------------------------------
    // Send phone OTP after successful database transaction.
    //
    // OTP failure does NOT roll back account creation.
    // User can request another OTP later.
    // ---------------------------------------------------------

    try {
      const { OTPService } =
        await import("../../services/otp.service");

      await OTPService.sendPhoneOTP(
        result.user.id,
        result.user.phone
      );
    } catch (otpError) {
      console.error(
        "Phone OTP delivery failed:",
        otpError instanceof Error
          ? otpError.message
          : otpError
      );
    }

    // ---------------------------------------------------------
    // Add driver to Redis availability set.
    //
    // Redis is operational state. If Redis is temporarily
    // unavailable, account creation should not be destroyed.
    // ---------------------------------------------------------

    if (result.driverId) {
      try {
        await redis.sadd(
          "drivers:available",
          result.driverId
        );
      } catch (redisError) {
        console.error(
          "Failed to add driver to Redis availability set:",
          redisError instanceof Error
            ? redisError.message
            : redisError
        );
      }
    }

    // ---------------------------------------------------------
    // JWTs
    // ---------------------------------------------------------

    const accessToken = signAccessToken({
      id: result.user.id,
      role: result.user.role,
      driverId: result.driverId,
      merchantType:
        result.savedMerchantType,
    });

    const refreshToken = signRefreshToken({
      id: result.user.id,
    });

    // ---------------------------------------------------------
    // Store hashed refresh token
    // ---------------------------------------------------------

    const refreshTokenHash =
      await bcrypt.hash(
        refreshToken,
        BCRYPT_ROUNDS
      );

    await prisma.user.update({
      where: {
        id: result.user.id,
      },
      data: {
        refreshTokenHash,
      },
    });

    return {
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        phone: result.user.phone,
        role: result.user.role,
        emailVerified:
          result.user.emailVerified,
        phoneVerified:
          result.user.phoneVerified,
        merchantType:
          result.savedMerchantType,
      },

      accessToken,
      refreshToken,

      /*
       * Kept for compatibility with your existing frontend.
       *
       * IMPORTANT:
       * Do not expose this in production API responses if you
       * already deliver verification links by email.
       */
      verifyToken,
    };
  }

  // ===========================================================
  // LOGIN
  // ===========================================================

  static async login(
    phoneInput: string,
    password: string
  ) {
    if (
      !phoneInput ||
      typeof phoneInput !== "string"
    ) {
      throw new Error("Invalid credentials");
    }

    if (
      !password ||
      typeof password !== "string"
    ) {
      throw new Error("Invalid credentials");
    }

    let phone: string;

    try {
      phone = normalizeTZPhone(
        phoneInput
      );
    } catch {
      throw new Error("Invalid credentials");
    }

    const user =
      await prisma.user.findUnique({
        where: {
          phone,
        },
      });

    /*
     * Generic error prevents account enumeration.
     */
    if (!user) {
      throw new Error("Invalid credentials");
    }

    if (
      user.deletedAt ||
      user.status !== "active"
    ) {
      throw new Error(
        "Account is unavailable"
      );
    }

    let passwordValid = false;

    try {
      passwordValid =
        await bcrypt.compare(
          password,
          user.password
        );
    } catch {
      passwordValid = false;
    }

    if (!passwordValid) {
      throw new Error("Invalid credentials");
    }

    // ---------------------------------------------------------
    // Merchant data
    // ---------------------------------------------------------

    let merchantType: string | null =
      null;

    if (user.role === "merchant") {
      const merchant =
        await prisma.merchant.findUnique({
          where: {
            userId: user.id,
          },
          select: {
            merchantType: true,
          },
        });

      merchantType =
        merchant?.merchantType ||
        "GENERAL_ECOMMERCE";
    }

    // ---------------------------------------------------------
    // Driver data
    // ---------------------------------------------------------

    let driverId: string | null =
      null;

    if (user.role === "driver") {
      const driver =
        await prisma.driver.findUnique({
          where: {
            userId: user.id,
          },
          select: {
            id: true,
            isActive: true,
            status: true,
          },
        });

      driverId =
        driver?.id || null;

      if (driverId && driver?.isActive) {
        try {
          await redis.sadd(
            "drivers:available",
            driverId
          );
        } catch (redisError) {
          console.error(
            "Failed to restore driver Redis availability:",
            redisError instanceof Error
              ? redisError.message
              : redisError
          );
        }
      }
    }

    // ---------------------------------------------------------
    // Tokens
    // ---------------------------------------------------------

    const accessToken =
      signAccessToken({
        id: user.id,
        role: user.role,
        driverId,
        merchantType,
      });

    const refreshToken =
      signRefreshToken({
        id: user.id,
      });

    const refreshTokenHash =
      await bcrypt.hash(
        refreshToken,
        BCRYPT_ROUNDS
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
      success: true,

      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,

        emailVerified:
          user.emailVerified,

        phoneVerified:
          user.phoneVerified,

        merchantType,
      },

      accessToken,
      refreshToken,
    };
  }

  // ===========================================================
  // REFRESH TOKEN
  // ===========================================================

  static async refresh(
    token: string
  ) {
    if (
      !token ||
      typeof token !== "string"
    ) {
      throw new Error(
        "Refresh token is required"
      );
    }

    let payload: any;

    try {
      payload =
        verifyRefreshToken(token);
    } catch {
      throw new Error("Unauthorized");
    }

    if (
      !payload ||
      typeof payload !== "object" ||
      !payload.id
    ) {
      throw new Error("Unauthorized");
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: payload.id,
        },
      });

    if (
      !user ||
      !user.refreshTokenHash ||
      user.deletedAt ||
      user.status !== "active"
    ) {
      throw new Error("Unauthorized");
    }

    let valid = false;

    try {
      valid = await bcrypt.compare(
        token,
        user.refreshTokenHash
      );
    } catch {
      valid = false;
    }

    if (!valid) {
      throw new Error("Unauthorized");
    }

    // ---------------------------------------------------------
    // Driver information
    // ---------------------------------------------------------

    let driverId: string | null =
      null;

    if (user.role === "driver") {
      const driver =
        await prisma.driver.findUnique({
          where: {
            userId: user.id,
          },
          select: {
            id: true,
          },
        });

      driverId =
        driver?.id || null;
    }

    // ---------------------------------------------------------
    // Merchant information
    // ---------------------------------------------------------

    let merchantType: string | null =
      null;

    if (user.role === "merchant") {
      const merchant =
        await prisma.merchant.findUnique({
          where: {
            userId: user.id,
          },
          select: {
            merchantType: true,
          },
        });

      merchantType =
        merchant?.merchantType ||
        "GENERAL_ECOMMERCE";
    }

    // ---------------------------------------------------------
    // Rotate refresh token
    // ---------------------------------------------------------

    const accessToken =
      signAccessToken({
        id: user.id,
        role: user.role,
        driverId,
        merchantType,
      });

    const newRefreshToken =
      signRefreshToken({
        id: user.id,
      });

    const newRefreshTokenHash =
      await bcrypt.hash(
        newRefreshToken,
        BCRYPT_ROUNDS
      );

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        refreshTokenHash:
          newRefreshTokenHash,
      },
    });

    return {
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  // ===========================================================
  // VERIFY ACCESS TOKEN
  // ===========================================================

  static async verifyToken(
    token: string
  ) {
    if (
      !token ||
      typeof token !== "string"
    ) {
      throw new Error("Token is required");
    }

    const secret =
      process.env.JWT_SECRET;

    if (!secret) {
      throw new Error(
        "JWT_SECRET is not configured"
      );
    }

    try {
      return jwt.verify(
        token,
        secret
      );
    } catch {
      throw new Error(
        "Invalid token"
      );
    }
  }

  // ===========================================================
  // LOGOUT
  // ===========================================================

  static async logout(
    userId: string
  ) {
    if (
      !userId ||
      typeof userId !== "string"
    ) {
      throw new Error(
        "User ID is required"
      );
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

  // ===========================================================
  // EMAIL VERIFICATION
  // ===========================================================

  static async verifyEmail(
    token: string
  ) {
    if (
      !token ||
      typeof token !== "string"
    ) {
      throw new Error(
        "Verification token is required"
      );
    }

    const user =
      await prisma.user.findFirst({
        where: {
          verifyToken: token,

          verifyTokenExpires: {
            gt: new Date(),
          },
        },

        select: {
          id: true,
          emailVerified: true,
        },
      });

    if (!user) {
      throw new Error(
        "Invalid or expired verification token"
      );
    }

    await prisma.user.update({
      where: {
        id: user.id,
      },

      data: {
        emailVerified: true,

        emailVerifiedAt:
          new Date(),

        verifyToken: null,

        verifyTokenExpires: null,
      },
    });

    return true;
  }

  // ===========================================================
  // FORGOT PASSWORD
  // ===========================================================

  static async forgotPassword(
    email: string
  ) {
    if (
      !email ||
      typeof email !== "string"
    ) {
      throw new Error(
        "Email is required"
      );
    }

    const normalizedEmail =
      normalizeEmail(email);

    const user =
      await prisma.user.findUnique({
        where: {
          email: normalizedEmail,
        },

        select: {
          id: true,
        },
      });

    /*
     * Always return the same logical result whether the
     * account exists or not.
     */
    if (!user) {
      return {
        success: true,
      };
    }

    const token =
      crypto
        .randomBytes(32)
        .toString("hex");

    const expiresAt = new Date(
      Date.now() +
        PASSWORD_RESET_MINUTES *
          60 *
          1000
    );

    await prisma.user.update({
      where: {
        id: user.id,
      },

      data: {
        passwordResetToken:
          token,

        passwordResetExpires:
          expiresAt,
      },
    });

    /*
     * IMPORTANT:
     * The raw token is intentionally NOT returned to the
     * HTTP controller.
     *
     * Your email/SMS service should receive this token and
     * send the reset link to the user.
     */
    return {
      success: true,
      token,
    };
  }

  // ===========================================================
  // RESET PASSWORD
  // ===========================================================

  static async resetPassword(
    token: string,
    password: string
  ) {
    if (
      !token ||
      typeof token !== "string"
    ) {
      throw new Error(
        "Reset token is required"
      );
    }

    validatePassword(password);

    const user =
      await prisma.user.findFirst({
        where: {
          passwordResetToken: token,

          passwordResetExpires: {
            gt: new Date(),
          },
        },

        select: {
          id: true,
        },
      });

    if (!user) {
      throw new Error(
        "Invalid or expired reset token"
      );
    }

    const hash =
      await bcrypt.hash(
        password,
        BCRYPT_ROUNDS
      );

    /*
     * Reset password and invalidate:
     *
     * - password reset token
     * - existing refresh token
     *
     * This forces existing sessions to authenticate again.
     */
    await prisma.user.update({
      where: {
        id: user.id,
      },

      data: {
        password: hash,

        passwordResetToken: null,

        passwordResetExpires: null,

        refreshTokenHash: null,
      },
    });

    return true;
  }
}