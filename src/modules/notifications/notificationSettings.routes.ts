import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { NotificationSettingsController } from "./notificationSettings.controller";

const router = Router();

router.get("/notification-settings", authMiddleware, NotificationSettingsController.getSettings);
router.put("/notification-settings", authMiddleware, NotificationSettingsController.updateSettings);

export default router;