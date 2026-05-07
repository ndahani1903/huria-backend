import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { UserController } from "./user.controller";

const router = Router();

// Protected profile routes
router.get("/me", authMiddleware, UserController.me);
router.put("/me", authMiddleware, UserController.updateMe);

export default router;