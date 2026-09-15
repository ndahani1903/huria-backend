// src/modules/merchants/merchantWallet.controller.ts

import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { MerchantWalletService } from './merchantWallet.service';
import { prisma } from '../../config/db';

export class MerchantWalletController {
 static async getWallet(req: AuthRequest, res: Response) {
    console.log("🔵 getWallet called");
  console.log("🔵 req.user:", req.user);

    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

     console.log("🔵 Looking up merchant for userId:", req.user.id);

      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      console.log("🔵 Found merchant:", merchant?.id);

      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      console.log("🔵 Getting wallet for merchant:", merchant.id);
    const wallet = await MerchantWalletService.getWallet(merchant.id);
    console.log("🔵 Wallet data:", wallet);

      res.json(wallet);
    } catch (error: any) {
      console.error('Get wallet error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get wallet balance
  static async getBalance(req: AuthRequest, res: Response) {
    console.log("🔵 getBalance called");
  console.log("🔵 req.user:", req.user);

    try {
       if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      const balance = await MerchantWalletService.getBalance(merchant.id);
      res.json({
      balance: Number(balance.balance) || 0,
      pendingBalance: Number(balance.pendingBalance) || 0,
      totalEarned: Number(balance.totalEarned) || 0
    });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
  
  // Request withdrawal
  static async requestWithdrawal(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const { amount, phone } = req.body;
      
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      // Create withdrawal request
      const withdrawal = await MerchantWalletService.requestWithdrawal(
        merchant.id,
        amount,
        phone || merchant.phone
      );
      
      res.json(withdrawal);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
   
  // Get transaction history
  static async getTransactions(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const merchant = await prisma.merchant.findUnique({
        where: { userId: req.user.id }
      });
      
      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }
      
      const transactions = await MerchantWalletService.getTransactionHistory(merchant.id);
      res.json(transactions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}