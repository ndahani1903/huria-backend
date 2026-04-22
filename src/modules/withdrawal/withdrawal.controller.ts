import { Response } from "express";
import { WithdrawalService } from "./withdrawal.service";
import { AuthRequest } from "../../middleware/auth.middleware";
import { prisma } from "../../config/db";

export class WithdrawalController {
  static async request(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const userId = req.user.id;
      const { amount } = req.body;

       // ✅ Find driver by userId
      const driver = await prisma.driver.findUnique({
        where: { userId: userId }
      });

      if (!driver) {
        return res.status(404).json({ error: "Driver profile not found. Please contact support." });
      }

      const withdrawal = await WithdrawalService.request(driver.id, amount);
      res.json(withdrawal);
    } catch (e: any) {
       console.error("Withdrawal request error:", e);
      res.status(500).json({ error: e.message });
    }
  }

  static async getAll(req: AuthRequest, res: Response) {
    const data = await WithdrawalService.getAll();
    res.json(data);
  }
}