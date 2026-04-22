import { Router } from 'express';
import { DriverController } from './driver.controller';
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";

const router = Router();

router.post("/location", DriverController.updateLocation);
router.post('/heartbeat', authMiddleware, DriverController.heartbeat);
router.post('/online', authMiddleware, DriverController.goOnline);
router.post('/offline', authMiddleware, DriverController.goOffline);
router.get('/status', authMiddleware, DriverController.getStatus);

// Cleanup endpoint (admin only)
router.post('/cleanup-stale', authMiddleware, requireRole("admin"), DriverController.cleanupStale);

export default router;
