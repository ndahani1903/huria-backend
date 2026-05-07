import { Router } from "express";
import { MerchantController } from "./merchant.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { 
  rateLimitMiddleware, 
  authRateLimiter, 
  paymentRateLimiter 
} from "../../middleware/rateLimit.middleware";
import { upload } from "../../middleware/upload.middleware";

const router = Router();
 
// Order management
router.get("/orders", 
  authMiddleware, 
  requireRole("merchant"), 
  rateLimitMiddleware,
  MerchantController.getMyOrders
);

// Earnings
router.get("/earnings", 
  authMiddleware, 
  requireRole("merchant"), 
  rateLimitMiddleware,
  MerchantController.getEarnings
);

/*

// Optional: Dashboard stats
router.get("/dashboard/stats", 
  authMiddleware, 
  requireRole("merchant"), 
  rateLimitMiddleware,
  MerchantController.getDashboardStats
);
*/


export default router;