import { Response } from "express";
import { WithdrawalService } from "./withdrawal.service";
import { AuthRequest } from "../../middleware/auth.middleware";

export class WithdrawalController {
  static async request(req: AuthRequest, res: Response) {
    try {
      const driverId = req.user.id;
      const { amount } = req.body;

      const withdrawal = await WithdrawalService.request(driverId, amount);

      res.json(withdrawal);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  }

  static async getAll(req: AuthRequest, res: Response) {
    const data = await WithdrawalService.getAll();
    res.json(data);
  }
}