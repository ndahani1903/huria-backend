import { Router } from "express";
import {
  AuthController,
  startRegistration,
  completeRegistration
} from "./auth.controller";
import { 
  rateLimitMiddleware, 
  authRateLimiter, 
  paymentRateLimiter 
} from '../../middleware/rateLimit.middleware';

const router = Router();

// Auth routes with rate limiting
router.post("/register", authRateLimiter, AuthController.register);

router.post("/login", authRateLimiter, AuthController.login);

// Refresh token
router.post("/refresh-token", rateLimitMiddleware, AuthController.refresh);

// Logout
router.post("/logout", authRateLimiter, AuthController.logout);

 // Password reset routes 
router.post("/forgot-password", authRateLimiter, AuthController.forgotPassword);

router.post("/reset-password", authRateLimiter, AuthController.resetPassword);

// Email verification
router.post("/verify-email", rateLimitMiddleware, AuthController.verifyEmail);

/*router.post("/resend-verification", authRateLimiter, AuthController.resendVerification);
  */

router.post("/start-registration", startRegistration);
router.post("/complete-registration", completeRegistration);



export default router;
