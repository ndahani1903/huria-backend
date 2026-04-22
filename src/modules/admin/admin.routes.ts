import { Router } from "express";
import { AdminController } from "./admin.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";

const router = Router();

// Stats
router.get("/stats", authMiddleware, requireRole("admin"), AdminController.stats);

// User management
router.get("/users", authMiddleware, requireRole("admin"), AdminController.users);

// Driver management
router.get("/drivers", authMiddleware, requireRole("admin"), AdminController.getDrivers);

// Merchant management
router.get("/merchants", authMiddleware, requireRole("admin"), AdminController.getMerchants);

// Order management
router.get("/orders", authMiddleware, requireRole("admin"), AdminController.getOrders);

//Analytics management
router.get("/analytics", authMiddleware, requireRole("admin"), AdminController.getAnalytics);

//top drivers
router.get("/top-drivers", authMiddleware, requireRole("admin"), AdminController.topDrivers);

// Dispute management
router.get('/disputes', AdminController.getDisputes);
router.put('/disputes/:id', AdminController.updateDispute);

// Withdrawal management
router.get('/withdrawals', AdminController.getWithdrawals);
router.put('/withdrawals/:id', AdminController.updateWithdrawal);

export default router;
