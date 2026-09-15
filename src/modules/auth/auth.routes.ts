// src/modules/auth/auth.routes.ts

import { Router } from "express";
import {
  AuthController,
  startRegistration,
  completeRegistration
} from "./auth.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { 
  apiRateLimiter, 
  authRateLimiter, 
  paymentRateLimiter 
} from '../../middleware/rateLimit.middleware';

const router = Router();

// Auth routes with rate limiting
router.post("/register", authRateLimiter, AuthController.register);

router.post("/login", authRateLimiter, AuthController.login);

// Refresh token
router.post("/refresh-token", apiRateLimiter, AuthController.refresh);

// Logout
router.post("/logout", authRateLimiter, AuthController.logout);

 // Password reset routes 
router.post("/forgot-password", authRateLimiter, AuthController.forgotPassword);

router.post("/reset-password", authRateLimiter, AuthController.resetPassword);

// Email verification
router.post("/verify-email", apiRateLimiter, AuthController.verifyEmail);

/*router.post("/resend-verification", authRateLimiter, AuthController.resendVerification);
  */

router.post("/start-registration", startRegistration);
router.post("/complete-registration", completeRegistration);

// Phone OTP verification
router.post("/send-otp", authMiddleware, AuthController.sendOTP);
router.post("/verify-otp", authMiddleware, AuthController.verifyOTP);
router.post("/resend-otp", authMiddleware, AuthController.resendOTP);

// Check if phone is verified
router.get("/verification-status", authMiddleware, AuthController.verificationStatus);


export default router;
