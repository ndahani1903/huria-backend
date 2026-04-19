import { Router } from 'express';
import { DriverController } from './driver.controller';
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";

const router = Router();

router.post('/', DriverController.create);
router.post("/location", DriverController.updateLocation);
router.post('/online', authMiddleware, requireRole("driver"), DriverController.goOnline);
router.post('/offline', authMiddleware, requireRole("driver"), DriverController.goOffline);
router.post('/heartbeat', authMiddleware, requireRole("driver"), DriverController.heartbeat);
router.get('/status', authMiddleware, requireRole("driver"), DriverController.getStatus);

// Cleanup endpoint (admin only)
router.post('/cleanup-stale', authMiddleware, requireRole("admin"), DriverController.cleanupStale);

export default router;
