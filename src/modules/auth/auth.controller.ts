import { Request, Response } from "express";
import { AuthService } from "./auth.service";
import crypto from "crypto";
import bcrypt from "bcrypt";
import { prisma } from "../../config/db";
import { normalizeTZPhone  } from "../../utils/phone";

export class AuthController {
  static register = async (req: Request, res: Response) => {
    try {
      const data = await AuthService.register(req.body);
      res.json(data);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  };

  static login = async (req: Request, res: Response) => {
    try {
      const data = await AuthService.login(
        req.body.phone,
        req.body.password
      );
      res.json(data);
    } catch (e: any) {
      res.status(401).json({ error: e.message });
    }
  };

   static refresh = async (req: Request, res: Response) => {
    try {
      const data = await AuthService.refresh(
        req.body.refreshToken
      );
      res.json(data);
    } catch (e: any) {
      res.status(401).json({ error: e.message });
    }
  };

   static logout = async (req: any, res: Response) => {
    await AuthService.logout(req.user.id);
    res.json({ success: true });
  };

  static verifyEmail = async (req: Request, res: Response) => {
    await AuthService.verifyEmail(req.body.token);
    res.json({ success: true });
  };

  static forgotPassword = async (
    req: Request,
    res: Response
  ) => {
  const token = await AuthService.forgotPassword(
      req.body.email
    );
    res.json({ success: true, token });
  };

  static resetPassword = async (
    req: Request,
    res: Response
  ) => {
 await AuthService.resetPassword(
      req.body.token,
      req.body.password
    );
    res.json({ success: true });
  };
}

export const startRegistration = async (req: Request, res: Response) => {
  try {
    const {
      email,
      phone: rawPhone,
      password,
      role
    } = req.body;
const phone = normalizeTZPhone(rawPhone);
    // CHECK EXISTING USER
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { email },
          { phone }
        ]
      }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists"
      });
    }

    // HASH PASSWORD BEFORE STORING
    const hashedPassword = await bcrypt.hash(password, 10);

    // CREATE SECURE TOKEN
    const token = crypto.randomBytes(32).toString("hex");

    // STORE TEMP DATA
    await prisma.pendingRegistration.create({
      data: {
        token,
        role,
        data: {
          ...req.body,
          password: hashedPassword
        },
        expiresAt: new Date(Date.now() + 1000 * 60 * 30)
      }
    });

    res.json({
      success: true,
      tempToken: token
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Failed to start registration"
    });
  }
};

export const completeRegistration = async (req: Request, res: Response) => {
  try {
    const {
      tempToken,
      signature,
      ipAddress,
      userAgent
    } = req.body;

    const pending = await prisma.pendingRegistration.findUnique({
      where: {
        token: tempToken
      }
    });

    if (!pending) {
      return res.status(400).json({
        success: false,
        message: "Registration session expired"
      });
    }

    if (new Date() > pending.expiresAt) {
      await prisma.pendingRegistration.delete({
        where: { token: tempToken }
      });

      return res.status(400).json({
        success: false,
        message: "Registration expired"
      });
    }

    // GET STORED DATA
const registrationData = pending.data as any;

// CREATE BASE USER
const result = await AuthService.register({
  ...registrationData
});

if (!result?.user?.id) {
  return res.status(500).json({
    success: false,
    message: "User creation failed"
  });
}
    // SAVE SIGNATURE - Using your existing AgreementSignature model
    const agreementHash = crypto
      .createHash('sha256')
      .update(`${registrationData.role}-1.0.0`)
      .digest('hex');


    // SAVE SIGNATURE
    await prisma.agreementSignature.create({
      data: {
        userId: result.user.id,
        agreementType: pending.role,
        agreementVersion: '1.0.0',
        agreementHash: agreementHash,
        signatureData: signature,
        ipAddress,
        userAgent,
        signedAt: new Date()
      }
    });

    // DELETE TEMP DATA
    await prisma.pendingRegistration.delete({
      where: {
        token: tempToken
      }
    });

    res.json({
  success: true,
  accessToken: result.accessToken,
  refreshToken: result.refreshToken,
  user: result.user
});

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Registration failed"
    });
  }
};
