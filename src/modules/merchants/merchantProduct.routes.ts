import { Router } from "express";
import { MerchantProductController } from "./merchantProduct.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { 
  rateLimitMiddleware, 
  authRateLimiter, 
  paymentRateLimiter 
} from "../../middleware/rateLimit.middleware";
import { upload } from "../../middleware/upload.middleware";

const router = Router();

// All routes require merchant authentication
router.use(authMiddleware, requireRole("merchant"));

// Product CRUD operations
router.get("/products", rateLimitMiddleware, MerchantProductController.getMyProducts);

router.post("/products", 
authRateLimiter,  // Stricter limit for creating products
upload.array("images", 5), MerchantProductController.createProduct);

router.put("/products/:id",  rateLimitMiddleware, MerchantProductController.updateProduct);

router.delete("/products/:id", rateLimitMiddleware, MerchantProductController.deleteProduct);

export default router;