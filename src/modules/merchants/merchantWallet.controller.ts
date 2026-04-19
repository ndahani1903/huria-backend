import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { MerchantWalletService } from './merchantWallet.service';
import { prisma } from '../../config/db';

export class MerchantWalletController {
  
  // Get wallet balance
  static async getBalance(req: AuthRequest, res: Response) {
    try {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      const balance = await MerchantWalletService.getBalance(merchant.id);
      res.json(balance);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  // Request withdrawal
  static async requestWithdrawal(req: AuthRequest, res: Response) {
    try {
      const { amount, phone } = req.body;
      
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      const withdrawal = await MerchantWalletService.requestWithdrawal(
        merchant.id,
        amount,
        phone || merchant.phone
      );
      
      res.json(withdrawal);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  // Get transaction history
  static async getTransactions(req: AuthRequest, res: Response) {
    try {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      const transactions = await MerchantWalletService.getTransactionHistory(merchant.id);
      res.json(transactions);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}