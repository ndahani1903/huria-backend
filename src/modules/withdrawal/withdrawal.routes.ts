import { Router } from "express";
import { WithdrawalController } from "./withdrawal.controller";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";

const router = Router();

router.post(
  "/request",
  authMiddleware,
  requireRole("driver"),
  WithdrawalController.request
);

router.get(
  "/all",
  authMiddleware,
  requireRole("admin"),
  WithdrawalController.getAll
);

export default router;