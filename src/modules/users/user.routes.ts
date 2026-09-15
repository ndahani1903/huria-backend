import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { UserController } from "./user.controller";

const router = Router();


// Protected profile routes
router.get("/me", authMiddleware, UserController.me);
router.put("/me", authMiddleware, UserController.updateMe);

// Profile routes
router.get("/profile", authMiddleware, UserController.getProfile);
router.put("/profile", authMiddleware, UserController.updateProfile);

// Password
router.post("/change-password", authMiddleware, UserController.changePassword);

// Notifications
router.get("/notifications", authMiddleware, UserController.getNotifications);
router.patch("/notifications/:id/read", authMiddleware, UserController.markNotificationRead);
router.patch("/notifications/read-all", authMiddleware, UserController.markAllNotificationsRead);

// Activity logs
router.get("/activity-logs", authMiddleware, UserController.getActivityLogs);

// Notification settings
router.get("/notification-settings", authMiddleware, UserController.getNotificationSettings);
router.put("/notification-settings", authMiddleware, UserController.updateNotificationSettings);

// Test notification (for development)
router.post("/test-notification", authMiddleware, UserController.sendTestNotification);

// ✅ NEW: Get user by ID (for social features)
router.get("/:id", authMiddleware, UserController.getUserById);

// ✅ NEW: Get multiple users by IDs
router.post("/batch", authMiddleware, UserController.getUsersByIds);

export default router;