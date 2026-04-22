import { Router } from "express";
import { AdminController } from "./admin.controller";
import { AuthRequest, authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
/*import { AnalyticsService } from "../../services/analytics.service";*/

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

/* //daily analytics
router.get('/analytics/daily', authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const stats = await AnalyticsService.getDailyStats(new Date(req.query.date as string));
    res.json(stats);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

//weekly analytics
router.get('/analytics/weekly', authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const report = await AnalyticsService.getWeeklyReport();
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

//top products analytics
router.get('/analytics/top-products', authMiddleware, requireRole("admin"), async (req, res) => {
  try {
    const products = await AnalyticsService.getTopProducts(10);
    res.json(products);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
*/
export default router;
