import { Response } from "express";
import { WalletService } from "./wallet.service";
import { AuthRequest } from "../../middleware/auth.middleware";

export class WalletController {
  static async getWallet(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const wallet = await WalletService.getWallet(req.user.id);
      res.json(wallet);
    } catch (error: any) {
      console.error("WALLET ERROR:", error.message); // 👈 ADD THIS
      res.status(500).json({ error: error.message });
    }
  }
}