import { Router } from "express";
import { MerchantController } from "./merchant.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";

const router = Router();

// Product management
router.get("/products", authMiddleware, requireRole("merchant"), MerchantController.getMyProducts);
router.post("/products", authMiddleware, requireRole("merchant"), MerchantController.addProduct);
router.put("/products/:id", authMiddleware, requireRole("merchant"), MerchantController.updateProduct);
router.delete("/products/:id", authMiddleware, requireRole("merchant"), MerchantController.deleteProduct);

// Order management
router.get("/orders", authMiddleware, requireRole("merchant"), MerchantController.getMyOrders);

// Earnings
router.get("/earnings", authMiddleware, requireRole("merchant"), MerchantController.getEarnings);

export default router;