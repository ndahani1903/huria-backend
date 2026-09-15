// src/modules/merchants/merchantWithdrawal.controller.ts

import { Response } from 'express';
import { AuthRequest } from '../../middleware/auth.middleware';
import { MerchantWithdrawalService } from './merchantWithdrawal.service';
import { prisma } from '../../config/db';

export class MerchantWithdrawalController {
  
  // Merchant requests withdrawal
  static async requestWithdrawal(req: AuthRequest, res: Response) {
    try {
    console.log("🔍 Withdrawal request received:", {
      userId: req.user?.id,
      body: req.body,
      headers: req.headers.authorization ? "Has token" : "No token"
    });

      if (!req.user) {
        console.error("❌ No user in request");
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const userId = req.user.id;
      const { amount, phoneNumber, paymentMethod, bankDetails } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Valid amount is required' });
      }

      if (!phoneNumber) {
        return res.status(400).json({ error: 'Phone number is required' });
      }

      // Find merchant by userId
      const merchant = await prisma.merchant.findUnique({
        where: { userId }
      });

      console.log(`🏪 Merchant found:`, merchant?.id, merchant?.businessName);

      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }

      const result = await MerchantWithdrawalService.requestWithdrawal(
        merchant.id,
        amount,
        phoneNumber,
        paymentMethod || 'mobile_money',
        bankDetails
      );

     console.log(`✅ Withdrawal request created: ${result.id}`);

      res.json({ 
        success: true, 
        message: 'Withdrawal request submitted successfully',
        withdrawal: result 
      });
    } catch (error: any) {
      console.error('❌ Withdrawal request error:', error.message);
    console.error('Stack:', error.stack);
      res.status(400).json({ error: error.message });
    }
  }

  // Merchant gets withdrawal history
  static async getWithdrawalHistory(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const userId = req.user.id;
      const merchant = await prisma.merchant.findUnique({
        where: { userId }
      });

      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }

      const history = await MerchantWithdrawalService.getWithdrawalHistory(merchant.id);
      res.json(history);
    } catch (error: any) {
      console.error('Get withdrawal history error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Merchant gets withdrawal limits
  static async getWithdrawalLimits(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const userId = req.user.id;
      const merchant = await prisma.merchant.findUnique({
        where: { userId }
      });

      if (!merchant) {
        return res.status(404).json({ error: 'Merchant not found' });
      }

      const limits = await MerchantWithdrawalService.getWithdrawalLimits(merchant.id);
      res.json(limits);
    } catch (error: any) {
      console.error('Get withdrawal limits error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // ============ ADMIN ENDPOINTS ============

  // Admin gets all pending withdrawals
  static async getPendingWithdrawals(req: AuthRequest, res: Response) {
    try {
      const pending = await MerchantWithdrawalService.getPendingWithdrawals();

    console.log(
  "🔥 Pending withdrawals count:",
  pending.length
);

console.log(
  "🔥 Pending withdrawals:",
  JSON.stringify(pending, null, 2)
);

      const stats = await MerchantWithdrawalService.getWithdrawalStats();
      res.json({ pending, stats });
    } catch (error: any) {
      console.error('Get pending withdrawals error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // Admin approves withdrawal
  static async approveWithdrawal(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { notes } = req.body;
      const adminId = req.user!.id;

      const result = await MerchantWithdrawalService.approveWithdrawal(id, adminId, notes);
      res.json({ success: true, withdrawal: result });
    } catch (error: any) {
      console.error('Approve withdrawal error:', error);
      res.status(400).json({ error: error.message });
    }
  }

  // Admin rejects withdrawal
  static async rejectWithdrawal(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const adminId = req.user!.id;

      if (!reason) {
        return res.status(400).json({ error: 'Rejection reason is required' });
      }

      const result = await MerchantWithdrawalService.rejectWithdrawal(id, adminId, reason);
      res.json({ success: true, withdrawal: result });
    } catch (error: any) {
      console.error('Reject withdrawal error:', error);
      res.status(400).json({ error: error.message });
    }
  }

  // Admin marks withdrawal as completed (payment sent)
  static async markAsCompleted(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { transactionReference } = req.body;
      const adminId = req.user!.id;

      if (!transactionReference) {
        return res.status(400).json({ error: 'Transaction reference is required' });
      }

      const result = await MerchantWithdrawalService.markAsCompleted(id, adminId, transactionReference);
      res.json({ success: true, withdrawal: result });
    } catch (error: any) {
      console.error('Mark as completed error:', error);
      res.status(400).json({ error: error.message });
    }
  }
}