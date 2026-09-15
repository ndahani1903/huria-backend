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

router.get("/test", 
  authMiddleware, 
  requireRole("merchant"), 
  (req, res) => {
    console.log("✅ Test endpoint hit!");
    res.json({ success: true, message: "Wallet route is working", timestamp: new Date().toISOString() });
  }
);


// ✅ WALLET ROUTES
router.get("/wallet", 
  authMiddleware, 
  requireRole("merchant"), 
  //rateLimitMiddleware,  // Prevent excessive balance checks
  MerchantWalletController.getWallet
);

// ✅ GET balance only (for dashboard)
router.get("/wallet/balance", 
  authMiddleware, 
  requireRole("merchant"), 
  //rateLimitMiddleware,
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