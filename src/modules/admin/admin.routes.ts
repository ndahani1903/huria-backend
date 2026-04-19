import { Router } from "express";
import { AdminController } from "./admin.controller";
import { authenticate, authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";


const router = Router();

router.get("/stats", authMiddleware, requireRole("admin"), AdminController.stats);
router.get("/users", authMiddleware, requireRole("admin"), AdminController.users);
router.get("/drivers", authMiddleware, requireRole("admin"), AdminController.getDrivers);
router.get("/merchants", authMiddleware, requireRole("admin"), AdminController.getMerchants);
router.get("/orders", authMiddleware, requireRole("admin"), AdminController.getOrders);
router.get("/analytics", authMiddleware, requireRole("admin"), AdminController.getAnalytics);
router.get("/top-drivers", AdminController.topDrivers);
router.get('/analytics/daily', authMiddleware, requireRole("admin"), async (req, res) => {
  const stats = await AnalyticsService.getDailyStats(new Date(req.query.date as string));
  res.json(stats);
});

router.get('/analytics/weekly', authMiddleware, requireRole("admin"), async (req, res) => {
  const report = await AnalyticsService.getWeeklyReport();
  res.json(report);
});

router.get('/analytics/top-products', authMiddleware, requireRole("admin"), async (req, res) => {
  const products = await AnalyticsService.getTopProducts(10);
  res.json(products);
});

export default router;
