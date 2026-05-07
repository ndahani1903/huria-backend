import { Router } from "express";
import { MerchantWalletController } from "./merchantWallet.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { 
  rateLimitMiddleware, 
  authRateLimiter, 
  paymentRateLimiter 
} from "../../middleware/rateLimit.middleware";

const router = Router();

// ✅ WALLET ROUTES
router.get("/wallet", 
  authMiddleware, 
  requireRole("merchant"), 
  rateLimitMiddleware,  // Prevent excessive balance checks
  MerchantWalletController.getBalance
);

router.post("/wallet/withdraw", 
  authMiddleware, 
  requireRole("merchant"), 
  paymentRateLimiter,  // Strict limit for withdrawal requests
  MerchantWalletController.requestWithdrawal
);

router.get("/wallet/transactions", 
  authMiddleware, 
  requireRole("merchant"), 
  rateLimitMiddleware,  // Prevent excessive transaction history polling
  MerchantWalletController.getTransactions
);

export default router;