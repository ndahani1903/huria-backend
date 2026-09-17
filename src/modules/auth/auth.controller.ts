// src/modules/auth/auth.controller.ts

import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import { OTPService } from "../../services/otp.service";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { prisma } from "../../config/db";
import { normalizeTZPhone } from "../../utils/phone";
import { AuthRequest } from "../../middleware/auth.middleware";

const PUBLIC_REGISTRATION_ROLES = [
  "customer",
  "driver",
  "merchant",
] as const;

const REGISTRATION_SESSION_MINUTES = 30;
const BCRYPT_ROUNDS = 12;

function normalizeEmail(
  email: string
): string {
  return email.trim().toLowerCase();
}

function isPublicRegistrationRole(
  role: unknown
): boolean {
  return (
    typeof role === "string" &&
    PUBLIC_REGISTRATION_ROLES.includes(
      role as
        (typeof PUBLIC_REGISTRATION_ROLES)[number]
    )
  );
}

function validatePassword(
  password: unknown
): password is string {
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  ) {
    return false;
  }

  return true;
}

export class AuthController {
  // ===========================================================
  // REGISTER
  // ===========================================================

  static register = async (
    req: Request,
    res: Response
  ) => {
    try {
      const data =
        await AuthService.register(
          req.body
        );

      /*
       * For compatibility this keeps the existing response.
       *
       * In a production email-verification flow, you should
       * remove verifyToken from the HTTP response and deliver
       * the verification link through email.
       */
      return res.status(201).json(data);
    } catch (e: any) {
      const message =
        e instanceof Error
          ? e.message
          : "Registration failed";

      return res.status(400).json({
        success: false,
        error: message,
      });
    }
  };

  // ===========================================================
  // LOGIN
  // ===========================================================

  static login = async (
    req: Request,
    res: Response
  ) => {
    try {
      const data =
        await AuthService.login(
          req.body.phone,
          req.body.password
        );

      return res.json(data);
    } catch (e: any) {
      /*
       * Authentication failures should use a generic response.
       */
      return res.status(401).json({
        success: false,
        error: "Invalid credentials",
      });
    }
  };

  // ===========================================================
  // REFRESH
  // ===========================================================

  static refresh = async (
    req: Request,
    res: Response
  ) => {
    try {
      const refreshToken =
        req.body?.refreshToken;

      const data =
        await AuthService.refresh(
          refreshToken
        );

      return res.json(data);
    } catch {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }
  };

  // ===========================================================
  // LOGOUT
  // ===========================================================

  static logout = async (
    req: AuthRequest,
    res: Response
  ) => {
    try {
      const userId =
        req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
      }

      await AuthService.logout(
        userId
      );

      return res.json({
        success: true,
      });
    } catch (e: any) {
      return res.status(400).json({
        success: false,
        error:
          e instanceof Error
            ? e.message
            : "Logout failed",
      });
    }
  };

  // ===========================================================
  // VERIFY EMAIL
  // ===========================================================

  static verifyEmail = async (
    req: Request,
    res: Response
  ) => {
    try {
      await AuthService.verifyEmail(
        req.body?.token
      );

      return res.json({
        success: true,
        message:
          "Email verified successfully",
      });
    } catch (e: any) {
      return res.status(400).json({
        success: false,
        error:
          e instanceof Error
            ? e.message
            : "Email verification failed",
      });
    }
  };

  // ===========================================================
  // FORGOT PASSWORD
  // ===========================================================

  static forgotPassword = async (
    req: Request,
    res: Response
  ) => {
    try {
      const email =
        req.body?.email;

      /*
       * AuthService still generates the token internally.
       * The controller deliberately does NOT return it.
       *
       * Your email/SMS delivery service should consume the
       * generated token.
       */
      const result =
        await AuthService.forgotPassword(
          email
        );

      /*
       * Do not reveal whether an account exists.
       */
      return res.json({
        success: true,
        message:
          "If an account exists for that email, password reset instructions have been sent.",
      });
    } catch (e: any) {
      return res.status(400).json({
        success: false,
        error:
          e instanceof Error
            ? e.message
            : "Password reset request failed",
      });
    }
  };

  // ===========================================================
  // RESET PASSWORD
  // ===========================================================

  static resetPassword = async (
    req: Request,
    res: Response
  ) => {
    try {
      await AuthService.resetPassword(
        req.body?.token,
        req.body?.password
      );

      return res.json({
        success: true,
        message:
          "Password reset successfully",
      });
    } catch (e: any) {
      return res.status(400).json({
        success: false,
        error:
          e instanceof Error
            ? e.message
            : "Password reset failed",
      });
    }
  };

  // ===========================================================
  // SEND PHONE OTP
  // ===========================================================

  static sendOTP = async (
    req: AuthRequest,
    res: Response
  ) => {
    try {
      const userId =
        req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
      }

      const user =
        await prisma.user.findUnique({
          where: {
            id: userId,
          },

          select: {
            phone: true,
            phoneVerified: true,
            status: true,
            deletedAt: true,
          },
        });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      if (
        user.deletedAt ||
        user.status !== "active"
      ) {
        return res.status(403).json({
          success: false,
          error:
            "Account is unavailable",
        });
      }

      if (user.phoneVerified) {
        return res.status(400).json({
          success: false,
          error:
            "Phone already verified",
        });
      }

      await OTPService.sendPhoneOTP(
        userId,
        user.phone
      );

      return res.json({
        success: true,
        message:
          "OTP sent to your phone number",
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to send OTP",
      });
    }
  };

  // ===========================================================
  // VERIFY PHONE OTP
  // ===========================================================

  static verifyOTP = async (
    req: AuthRequest,
    res: Response
  ) => {
    try {
      const userId =
        req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
      }

      const otp =
        typeof req.body?.otp ===
        "string"
          ? req.body.otp.trim()
          : "";

      if (!otp) {
        return res.status(400).json({
          success: false,
          error: "OTP is required",
        });
      }

      const result =
        await OTPService.verifyPhoneOTP(
          userId,
          otp
        );

      return res.json(result);
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "OTP verification failed",
      });
    }
  };

  // ===========================================================
  // RESEND OTP
  // ===========================================================

  static resendOTP = async (
    req: AuthRequest,
    res: Response
  ) => {
    try {
      const userId =
        req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
      }

      const result =
        await OTPService.resendOTP(
          userId
        );

      return res.json(result);
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to resend OTP",
      });
    }
  };

  // ===========================================================
  // VERIFICATION STATUS
  // ===========================================================

  static verificationStatus = async (
    req: AuthRequest,
    res: Response
  ) => {
    try {
      const userId =
        req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: "Unauthorized",
        });
      }

      const user =
        await prisma.user.findUnique({
          where: {
            id: userId,
          },

          select: {
            phoneVerified: true,
            emailVerified: true,
          },
        });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: "User not found",
        });
      }

      return res.json({
        phoneVerified:
          user.phoneVerified,

        emailVerified:
          user.emailVerified,

        /*
         * Kept for frontend compatibility.
         */
        verified:
          user.phoneVerified,
      });
    } catch (error: any) {
      return res.status(400).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to get verification status",
      });
    }
  };
}

// =============================================================
// START REGISTRATION
// =============================================================

export const startRegistration = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      email,
      phone: rawPhone,
      password,
      role,
    } = req.body;

    // ---------------------------------------------------------
    // Validate fields
    // ---------------------------------------------------------

    if (
      !email ||
      typeof email !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    if (!rawPhone) {
      return res.status(400).json({
        success: false,
        message:
          "Phone number is required",
      });
    }

    if (
      !validatePassword(password)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be between 8 and 128 characters",
      });
    }

    /*
     * VERY IMPORTANT:
     * Never allow public registration to create admin users.
     */
    if (
      !isPublicRegistrationRole(
        role
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid registration role",
      });
    }

    const normalizedEmail =
      normalizeEmail(email);

    let phone: string;

    try {
      phone =
        normalizeTZPhone(rawPhone);
    } catch {
      return res.status(400).json({
        success: false,
        message:
          "Invalid phone number",
      });
    }

    // ---------------------------------------------------------
    // Check existing user
    // ---------------------------------------------------------

    const existingUser =
      await prisma.user.findFirst({
        where: {
          OR: [
            {
              email:
                normalizedEmail,
            },
            {
              phone,
            },
          ],
        },

        select: {
          id: true,
        },
      });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message:
          "User already exists",
      });
    }

    // ---------------------------------------------------------
    // Hash password
    // ---------------------------------------------------------

    const hashedPassword =
      await bcrypt.hash(
        password,
        BCRYPT_ROUNDS
      );

    // ---------------------------------------------------------
    // Registration session token
    // ---------------------------------------------------------

    const token =
      crypto
        .randomBytes(32)
        .toString("hex");

    // ---------------------------------------------------------
    // Store sanitized registration data
    //
    // We intentionally don't blindly store the entire request
    // body because that could allow unexpected fields to enter
    // the pending registration JSON.
    // ---------------------------------------------------------

    const registrationData = {
      name: req.body.name,
      email: normalizedEmail,
      phone,

      password: hashedPassword,

      role,

      businessName:
        req.body.businessName,

      businessType:
        req.body.businessType,

      merchantType:
        req.body.merchantType,

      pickupAddress:
        req.body.pickupAddress,

      pickupLat:
        req.body.pickupLat,

      pickupLng:
        req.body.pickupLng,

      licenseNumber:
        req.body.licenseNumber,

      nidaNumber:
        req.body.nidaNumber,

      vehicleType:
        req.body.vehicleType,

      vehiclePlate:
        req.body.vehiclePlate,
    };

    await prisma.pendingRegistration.create(
      {
        data: {
          token,

          role,

          data: registrationData,

          expiresAt:
            new Date(
              Date.now() +
                1000 *
                  60 *
                  REGISTRATION_SESSION_MINUTES
            ),
        },
      }
    );

    return res.status(201).json({
      success: true,

      tempToken: token,

      expiresIn:
        REGISTRATION_SESSION_MINUTES *
        60,
    });
  } catch (error) {
    console.error(
      "Start registration failed:",
      error instanceof Error
        ? error.message
        : error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to start registration",
    });
  }
};

// =============================================================
// COMPLETE REGISTRATION
// =============================================================

export const completeRegistration = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      tempToken,
      signature,
      ipAddress,
      userAgent,
    } = req.body;

    // ---------------------------------------------------------
    // Validate temporary token
    // ---------------------------------------------------------

    if (
      !tempToken ||
      typeof tempToken !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Registration token is required",
      });
    }

    // ---------------------------------------------------------
    // Validate signature
    // ---------------------------------------------------------

    if (
      !signature ||
      typeof signature !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Agreement signature is required",
      });
    }

    const pending =
      await prisma.pendingRegistration.findUnique(
        {
          where: {
            token: tempToken,
          },
        }
      );

    if (!pending) {
      return res.status(400).json({
        success: false,
        message:
          "Registration session expired or invalid",
      });
    }

    // ---------------------------------------------------------
    // Check expiration
    // ---------------------------------------------------------

    if (
      new Date() >
      pending.expiresAt
    ) {
      await prisma.pendingRegistration
        .delete({
          where: {
            token: tempToken,
          },
        })
        .catch(() => undefined);

      return res.status(400).json({
        success: false,
        message:
          "Registration expired",
      });
    }

    // ---------------------------------------------------------
    // Validate role again.
    //
    // Never trust the role stored in a client-created
    // registration session.
    // ---------------------------------------------------------

    if (
      !isPublicRegistrationRole(
        pending.role
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid registration role",
      });
    }

    // ---------------------------------------------------------
    // Get stored registration data
    // ---------------------------------------------------------

    const registrationData =
      pending.data as Record<
        string,
        any
      >;

    if (
      registrationData.role !==
      pending.role
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Registration data is invalid",
      });
    }

    // ---------------------------------------------------------
    // Create user
    // ---------------------------------------------------------

    const result =
      await AuthService.register(
        {
          ...registrationData,

          /*
           * Force the role from the trusted pending-registration
           * record instead of allowing the request body to change it.
           */
          role: pending.role,
        },

        true
      );

    if (!result?.user?.id) {
      return res.status(500).json({
        success: false,
        message:
          "User creation failed",
      });
    }

    // ---------------------------------------------------------
    // Agreement hash
    // ---------------------------------------------------------

    const agreementHash =
      crypto
        .createHash("sha256")
        .update(
          `${pending.role}-1.0.0`
        )
        .digest("hex");

    // ---------------------------------------------------------
    // Save agreement signature
    // ---------------------------------------------------------

    try {
      await prisma.agreementSignature.create(
        {
          data: {
            userId:
              result.user.id,

            agreementType:
              pending.role,

            agreementVersion:
              "1.0.0",

            agreementHash,

            signatureData:
              signature,

            ipAddress:
              ipAddress || null,

            userAgent:
              userAgent || null,

            signedAt:
              new Date(),
          },
        }
      );
    } catch (agreementError) {
      /*
       * The account was already created by AuthService.
       *
       * Remove the newly created account if agreement persistence
       * fails, preventing a registered user without the required
       * agreement record.
       */
      await prisma.user
        .delete({
          where: {
            id: result.user.id,
          },
        })
        .catch(() => undefined);

      throw agreementError;
    }

    // ---------------------------------------------------------
    // Consume temporary registration session
    // ---------------------------------------------------------

    await prisma.pendingRegistration.delete({
      where: {
        token: tempToken,
      },
    });

    // ---------------------------------------------------------
    // Return successful registration
    // ---------------------------------------------------------

    return res.status(201).json({
      success: true,

      accessToken:
        result.accessToken,

      refreshToken:
        result.refreshToken,

      user: result.user,
    });
  } catch (error) {
    console.error(
      "Complete registration failed:",
      error instanceof Error
        ? error.message
        : error
    );

    return res.status(400).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Registration failed",
    });
  }
};