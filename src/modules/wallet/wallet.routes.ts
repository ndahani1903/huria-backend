import { Router } from "express";
import { WalletController } from "./wallet.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { 
  rateLimitMiddleware, 
  authRateLimiter, 
  paymentRateLimiter 
} from "../../middleware/rateLimit.middleware";

const router = Router();

// Get wallet balance and transactions
router.get(
  "/", 
  authMiddleware, 
  rateLimitMiddleware,  // Prevent excessive wallet polling
  WalletController.getWallet
);

/* // Optional: Add these additional wallet routes
router.post(
  "/withdraw", 
  authMiddleware, 
  paymentRateLimiter,  // Stricter limit for withdrawal requests
  WalletController.withdraw
);

router.get(
  "/transactions", 
  authMiddleware, 
  rateLimitMiddleware,
  WalletController.getTransactions
);
*/

export default router;