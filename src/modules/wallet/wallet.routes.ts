import { Router } from "express";
import { WalletController } from "./wallet.controller";
import { authMiddleware } from "../../middleware/auth.middleware";

const router = Router();

router.get(
  "/",
  authMiddleware, WalletController.getWallet);

export default router;