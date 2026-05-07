import { Router } from "express";
import { WithdrawalController } from "./withdrawal.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { 
  rateLimitMiddleware, 
  authRateLimiter, 
  paymentRateLimiter 
} from "../../middleware/rateLimit.middleware";

const router = Router();

// Driver requests withdrawal
router.post(
  "/request",
  authMiddleware,
  requireRole("driver"),
  paymentRateLimiter,  //Strict rate limit to prevent withdrawal abuse
  WithdrawalController.request
);

// Admin views all withdrawal requests
router.get(
  "/all",
  authMiddleware,
  requireRole("admin"),
  rateLimitMiddleware,  // Standard rate limit for admin views
  WithdrawalController.getAll
);

/*

// Optional: Add status check route
router.get(
  "/status/:withdrawalId",
  authMiddleware,
  rateLimitMiddleware,
  WithdrawalController.getStatus
);

// Optional: Admin processes withdrawal
router.put(
  "/:withdrawalId/process",
  authMiddleware,
  requireRole("admin"),
  paymentRateLimiter,  // Strict limit for processing withdrawals
  WithdrawalController.process
);

*/

export default router;