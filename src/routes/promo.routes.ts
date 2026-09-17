// src/routes/promo.routes.ts

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import PromoService from '../services/promo.service';
import { prisma } from '../config/db';

const router = Router();

// Admin: Create global promo
router.post(
  '/admin/create',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    try {
      const promo = await PromoService.createPromoCode(
        {
          code: req.body.code,
          type: req.body.type,
          discountType: req.body.discountType,
          discountValue: req.body.discountValue,
          minOrderAmount: req.body.minOrderAmount,
          maxDiscount: req.body.maxDiscount,
          usageLimit: req.body.usageLimit,
          usagePerUser: req.body.usagePerUser,
          startDate: new Date(req.body.startDate),
          endDate: new Date(req.body.endDate)
        },
        req.user!.id,
        true
      );

      res.json({
        success: true,
        promo
      });
    } catch (error: any) {
      res.status(400).json({
        error: error.message
      });
    }
  }
);

// Merchant: Create merchant-specific promo
router.post(
  '/merchant/create',
  authMiddleware,
  requireRole('merchant'),
  async (req, res) => {
    try {
      const merchant = await prisma.merchant.findUnique({
        where: {
          userId: req.user!.id
        }
      });

      if (!merchant) {
        return res.status(404).json({
          error: 'Merchant not found'
        });
      }

      const promo = await PromoService.createPromoCode(
        {
          code: req.body.code,
          type: 'merchant',
          discountType: req.body.discountType,
          discountValue: req.body.discountValue,
          minOrderAmount: req.body.minOrderAmount,
          maxDiscount: req.body.maxDiscount,
          usageLimit: req.body.usageLimit,
          usagePerUser: req.body.usagePerUser,
          merchantId: merchant.id,
          startDate: new Date(req.body.startDate),
          endDate: new Date(req.body.endDate)
        },
        req.user!.id,
        false
      );

      res.json({
        success: true,
        promo
      });
    } catch (error: any) {
      res.status(400).json({
        error: error.message
      });
    }
  }
);

// Get available promos for user
router.get(
  '/available',
  authMiddleware,
  async (req, res) => {
    try {
      const { subtotal } = req.query;

      const promos =
        await PromoService.getUserAvailablePromos(
          req.user!.id,
          Number(subtotal) || 0
        );

      res.json(promos);
    } catch (error: any) {
      res.status(400).json({
        error: error.message
      });
    }
  }
);

// Validate promo code (without applying)
router.post(
  '/validate',
  authMiddleware,
  async (req, res) => {
    try {
      const {
        code,
        subtotal,
        merchantId
      } = req.body;

      const result =
        await PromoService.validatePromoCode(
          code,
          req.user!.id,
          subtotal,
          merchantId
        );

      res.json(result);
    } catch (error: any) {
      res.status(400).json({
        error: error.message
      });
    }
  }
);

export default router;