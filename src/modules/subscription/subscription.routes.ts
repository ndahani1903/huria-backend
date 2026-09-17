import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import subscriptionService from "./subscription.service";
import { prisma } from "../../config/db";
import { Decimal } from "@prisma/client/runtime/library";

const router = Router();

/**
 * Express params can be typed as string | string[] depending
 * on the installed Express / @types/express version.
 *
 * This helper safely normalizes a route parameter to string.
 */
const getParamString = (
  value: string | string[] | undefined
): string | undefined => {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }

  return undefined;
};

// ============================================================
// PUBLIC / USER SUBSCRIPTION ROUTES
// ============================================================

// Get available subscription tiers
router.get("/tiers", async (req, res) => {
  try {
    const tiers =
      await subscriptionService.getAvailableTiers();

    res.json(tiers);
  } catch (error: any) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// Get user's current subscription
router.get(
  "/current",
  authMiddleware,
  async (req, res) => {
    try {
      const subscription =
        await subscriptionService.getCurrentSubscription(
          req.user!.id
        );

      res.json(
        subscription || {
          message: "No active subscription",
        }
      );
    } catch (error: any) {
      res.status(400).json({
        error: error.message,
      });
    }
  }
);

// Subscribe using mobile money (AzamPay)
router.post(
  "/subscribe-mobile",
  authMiddleware,
  async (req, res) => {
    try {
      const { tier, phone } = req.body;

      if (!tier) {
        return res.status(400).json({
          error: "Tier is required",
        });
      }

      if (
        !phone ||
        typeof phone !== "string"
      ) {
        return res.status(400).json({
          error: "Phone number required",
        });
      }

      let cleanPhone =
        phone.replace(/\D/g, "");

      // Convert 07xxxxxxxx -> 2557xxxxxxxx
      if (cleanPhone.startsWith("0")) {
        cleanPhone =
          "255" +
          cleanPhone.slice(1);
      }

      if (
        !/^255\d{9}$/.test(
          cleanPhone
        )
      ) {
        return res.status(400).json({
          error: "Invalid phone format",
        });
      }

      const result =
        await subscriptionService.subscribeWithMobile(
          req.user!.id,
          tier,
          cleanPhone
        );

      res.json(result);
    } catch (error: any) {
      res.status(400).json({
        error: error.message,
      });
    }
  }
);

// Cancel subscription
router.post(
  "/cancel",
  authMiddleware,
  async (req, res) => {
    try {
      await subscriptionService.cancelSubscription(
        req.user!.id
      );

      res.json({
        success: true,
        message: "Subscription cancelled",
      });
    } catch (error: any) {
      res.status(400).json({
        error: error.message,
      });
    }
  }
);

// Get subscription history
router.get(
  "/history",
  authMiddleware,
  async (req, res) => {
    try {
      const history =
        await prisma.subscription.findMany({
          where: {
            userId: req.user!.id,
          },
          orderBy: {
            createdAt: "desc",
          },
        });

      res.json(history);
    } catch (error: any) {
      res.status(400).json({
        error: error.message,
      });
    }
  }
);

// ============================================================
// PROMO CODE ROUTES
// ============================================================

// Validate a promo code
router.post(
  "/promo/validate",
  authMiddleware,
  async (req, res) => {
    try {
      const {
        code,
        subtotal,
        merchantId,
      } = req.body;

      if (
        !code ||
        typeof code !== "string"
      ) {
        return res.status(400).json({
          error: "Promo code is required",
        });
      }

      const result =
        await subscriptionService.validatePromoCode(
          code,
          req.user!.id,
          subtotal || 0,
          merchantId
        );

      res.json(result);
    } catch (error: any) {
      res.status(400).json({
        error: error.message,
      });
    }
  }
);

// Apply promo code
router.post(
  "/promo/apply",
  authMiddleware,
  async (req, res) => {
    try {
      const {
        code,
        subtotal,
        merchantId,
      } = req.body;

      if (
        !code ||
        typeof code !== "string"
      ) {
        return res.status(400).json({
          error: "Promo code is required",
        });
      }

      const promo =
        await subscriptionService.applyPromoCode(
          code,
          req.user!.id,
          subtotal || 0,
          merchantId
        );

      res.json({
        success: true,
        promo,
      });
    } catch (error: any) {
      res.status(400).json({
        error: error.message,
      });
    }
  }
);

// Remove promo code
router.post(
  "/promo/remove",
  authMiddleware,
  async (req, res) => {
    try {
      res.json({
        success: true,
      });
    } catch (error: any) {
      res.status(400).json({
        error: error.message,
      });
    }
  }
);

// ============================================================
// PAYMENT WEBHOOK
// ============================================================

router.post(
  "/payment-webhook",
  async (req, res) => {
    const signature =
      req.headers["x-signature"];

    if (
      !signature ||
      signature !==
        process.env.WEBHOOK_SECRET
    ) {
      return res.status(403).json({
        error: "Invalid webhook signature",
      });
    }

    try {
      console.log(
        "📞 Subscription webhook received"
      );

      let reference =
        req.body.reference;

      let success =
        req.body.success;

      let transactionId =
        req.body.transactionId;

      // Handle M-Pesa callback format
      if (
        req.body.Body?.stkCallback
      ) {
        const callback =
          req.body.Body.stkCallback;

        reference =
          callback.CheckoutRequestID;

        success =
          callback.ResultCode === 0;

        transactionId =
          callback.CheckoutRequestID;
      }

      if (
        !reference ||
        typeof reference !== "string"
      ) {
        return res.status(400).json({
          error:
            "Payment reference is required",
        });
      }

      const result =
        await subscriptionService.confirmPayment(
          reference,
          Boolean(success),
          transactionId
        );

      res.json({
        success: true,
        result,
      });
    } catch (error: any) {
      console.error(
        "Webhook error:",
        error
      );

      res.status(200).json({
        success: false,
        message: error.message,
      });
    }
  }
);

// Check payment status
router.get(
  "/payment-status/:reference",
  authMiddleware,
  async (req, res) => {
    try {
      const reference =
        getParamString(
          req.params.reference
        );

      if (!reference) {
        return res.status(400).json({
          error:
            "Payment reference is required",
        });
      }

      const status =
        await subscriptionService.getPaymentStatus(
          reference
        );

      res.json(status);
    } catch (error: any) {
      res.status(400).json({
        error: error.message,
      });
    }
  }
);

// Check card top-up status
router.get(
  "/card/topup-status/:reference",
  authMiddleware,
  async (req, res) => {
    try {
      const reference =
        getParamString(
          req.params.reference
        );

      if (!reference) {
        return res.status(400).json({
          error:
            "Top-up reference is required",
        });
      }

      const status =
        await subscriptionService.getCardTopupStatus(
          reference
        );

      res.json(status);
    } catch (error: any) {
      res.status(400).json({
        error: error.message,
      });
    }
  }
);

// ============================================================
// ADMIN ROUTES
// ============================================================

// Get all subscriptions
router.get(
  "/admin/all",
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {
    try {
      const subscriptions =
        await prisma.subscription.findMany({
          include: {
            user: {
              select: {
                name: true,
                email: true,
                phone: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });

      res.json(subscriptions);
    } catch (error: any) {
      res.status(500).json({
        error: error.message,
      });
    }
  }
);

// Refund HURIA Card payment
router.post(
  "/card/refund/:orderId",
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {
    try {
      const orderId =
        getParamString(
          req.params.orderId
        );

      const { reason } = req.body;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          error: "Order ID is required",
        });
      }

      if (
        !reason ||
        typeof reason !== "string" ||
        !reason.trim()
      ) {
        return res.status(400).json({
          success: false,
          error: "Refund reason is required",
        });
      }

      const refundResult =
        await subscriptionService.refundCardPayment(
          orderId,
          reason.trim()
        );

      return res.json({
        success: true,
        refund: refundResult,
      });
    } catch (error: any) {
      console.error(
        "Card refund error:",
        error
      );

      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// Get subscription stats
router.get(
  "/admin/stats",
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {
    try {
      const [
        total,
        active,
        byTier,
        revenue,
      ] = await Promise.all([
        prisma.subscription.count(),

        prisma.subscription.count({
          where: {
            status: "active",
          },
        }),

        prisma.subscription.groupBy({
          by: ["tier"],
          _count: true,
          where: {
            status: "active",
          },
        }),

        prisma.subscriptionTransaction.aggregate(
          {
            where: {
              status: "completed",
            },
            _sum: {
              amount: true,
            },
          }
        ),
      ]);

      res.json({
        totalSubscriptions: total,
        activeSubscriptions: active,
        subscriptionsByTier: byTier,
        totalRevenue:
          revenue._sum.amount || 0,
      });
    } catch (error: any) {
      res.status(500).json({
        error: error.message,
      });
    }
  }
);

// Create promo code
router.post(
  "/admin/promo/create",
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {
    try {
      const {
        code,
        type = "admin",
        discountType = "percentage",
        discountValue,
        minOrderAmount,
        maxDiscount,
        usageLimit,
        usagePerUser = 1,
        startDate,
        endDate,
      } = req.body;

      if (
        !code ||
        typeof code !== "string"
      ) {
        return res.status(400).json({
          error:
            "Promo code is required",
        });
      }

      if (
        discountValue === undefined ||
        discountValue === null
      ) {
        return res.status(400).json({
          error:
            "Discount value is required",
        });
      }

      if (!endDate) {
        return res.status(400).json({
          error:
            "End date is required",
        });
      }

      const existing =
        await prisma.promoCode.findUnique({
          where: {
            code: code.toUpperCase(),
          },
        });

      if (existing) {
        return res.status(400).json({
          error:
            "Promo code already exists",
        });
      }

      const promo =
        await prisma.promoCode.create({
          data: {
            code: code.toUpperCase(),
            type,
            discountType,
            discountValue:
              Number(discountValue),
            minOrderAmount:
              minOrderAmount
                ? new Decimal(
                    minOrderAmount
                  )
                : null,
            maxDiscount:
              maxDiscount
                ? new Decimal(
                    maxDiscount
                  )
                : null,
            usageLimit:
              usageLimit
                ? Number(usageLimit)
                : null,
            usagePerUser:
              Number(usagePerUser),
            merchantId: null,
            startDate: startDate
              ? new Date(startDate)
              : new Date(),
            endDate: new Date(
              endDate
            ),
            isActive: true,
          },
        });

      res.json({
        success: true,
        promo,
      });
    } catch (error: any) {
      console.error(
        "Admin promo creation error:",
        error
      );

      res.status(400).json({
        error: error.message,
      });
    }
  }
);

// Get all promos
router.get(
  "/admin/promos",
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {
    try {
      const promos =
        await prisma.promoCode.findMany({
          orderBy: {
            createdAt: "desc",
          },
          include: {
            merchant: {
              select: {
                businessName: true,
              },
            },
            usages: {
              select: {
                id: true,
              },
            },
          },
        });

      const formattedPromos =
        promos.map((promo) => ({
          ...promo,
          usageCount:
            promo.usages.length,
          usages: undefined,
        }));

      res.json(formattedPromos);
    } catch (error: any) {
      console.error(
        "Get promos error:",
        error
      );

      res.status(400).json({
        error: error.message,
      });
    }
  }
);

// Delete/deactivate promo
router.delete(
  "/admin/promo/:id",
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {
    try {
      const id =
        getParamString(
          req.params.id
        );

      if (!id) {
        return res.status(400).json({
          error:
            "Promo ID is required",
        });
      }

      await prisma.promoCode.update({
        where: { id },
        data: {
          isActive: false,
        },
      });

      res.json({
        success: true,
      });
    } catch (error: any) {
      res.status(400).json({
        error: error.message,
      });
    }
  }
);

// ============================================================
// MERCHANT PROMO MANAGEMENT
// ============================================================

// Merchant: Create promo
router.post(
  "/merchant/promo/create",
  authMiddleware,
  requireRole("merchant"),
  async (req, res) => {
    try {
      const {
        code,
        discountType = "percentage",
        discountValue,
        minOrderAmount,
        maxDiscount,
        usageLimit,
        usagePerUser = 1,
        endDate,
      } = req.body;

      if (
        !code ||
        typeof code !== "string"
      ) {
        return res.status(400).json({
          error:
            "Promo code is required",
        });
      }

      if (
        discountValue === undefined ||
        discountValue === null
      ) {
        return res.status(400).json({
          error:
            "Discount value is required",
        });
      }

      if (!endDate) {
        return res.status(400).json({
          error:
            "End date is required",
        });
      }

      const merchant =
        await prisma.merchant.findUnique({
          where: {
            userId: req.user!.id,
          },
        });

      if (!merchant) {
        return res.status(404).json({
          error: "Merchant not found",
        });
      }

      const existing =
        await prisma.promoCode.findUnique({
          where: {
            code: code.toUpperCase(),
          },
        });

      if (existing) {
        return res.status(400).json({
          error:
            "Promo code already exists",
        });
      }

      const promo =
        await prisma.promoCode.create({
          data: {
            code: code.toUpperCase(),
            type: "merchant",
            discountType,
            discountValue:
              Number(discountValue),
            minOrderAmount:
              minOrderAmount
                ? new Decimal(
                    minOrderAmount
                  )
                : null,
            maxDiscount:
              maxDiscount
                ? new Decimal(
                    maxDiscount
                  )
                : null,
            usageLimit:
              usageLimit
                ? Number(usageLimit)
                : null,
            usagePerUser:
              Number(usagePerUser),
            merchantId: merchant.id,
            startDate: new Date(),
            endDate: new Date(
              endDate
            ),
            isActive: true,
          },
        });

      res.json({
        success: true,
        promo,
      });
    } catch (error: any) {
      console.error(
        "Merchant promo creation error:",
        error
      );

      res.status(400).json({
        error: error.message,
      });
    }
  }
);

// Merchant: List own promos
router.get(
  "/merchant/promo/list",
  authMiddleware,
  requireRole("merchant"),
  async (req, res) => {
    try {
      const merchant =
        await prisma.merchant.findUnique({
          where: {
            userId: req.user!.id,
          },
        });

      if (!merchant) {
        return res.status(404).json({
          error: "Merchant not found",
        });
      }

      const promos =
        await prisma.promoCode.findMany({
          where: {
            merchantId: merchant.id,
            isActive: true,
          },
          orderBy: {
            createdAt: "desc",
          },
          include: {
            usages: {
              select: {
                id: true,
              },
            },
          },
        });

      const formattedPromos =
        promos.map((promo) => ({
          ...promo,
          usageCount:
            promo.usages.length,
          usages: undefined,
        }));

      res.json(formattedPromos);
    } catch (error: any) {
      console.error(
        "Get merchant promos error:",
        error
      );

      res.status(400).json({
        error: error.message,
      });
    }
  }
);

// Merchant: Deactivate promo
router.delete(
  "/merchant/promo/:id",
  authMiddleware,
  requireRole("merchant"),
  async (req, res) => {
    try {
      const id =
        getParamString(
          req.params.id
        );

      if (!id) {
        return res.status(400).json({
          error:
            "Promo ID is required",
        });
      }

      const promo =
        await prisma.promoCode.findFirst({
          where: {
            id,
            merchant: {
              userId: req.user!.id,
            },
          },
        });

      if (!promo) {
        return res.status(404).json({
          error: "Promo not found",
        });
      }

      await prisma.promoCode.update({
        where: { id },
        data: {
          isActive: false,
        },
      });

      res.json({
        success: true,
      });
    } catch (error: any) {
      console.error(
        "Delete merchant promo error:",
        error
      );

      res.status(400).json({
        error: error.message,
      });
    }
  }
);

// ============================================================
// HURIA CARD ROUTES
// ============================================================

// Get card details
router.get(
  "/card",
  authMiddleware,
  async (req, res) => {
    try {
      const card =
        await subscriptionService.getCardDetails(
          req.user!.id
        );

      res.json(card);
    } catch (error: any) {
      res.status(400).json({
        error: error.message,
      });
    }
  }
);

// Top up card
router.post(
  "/card/topup",
  authMiddleware,
  async (req, res) => {
    try {
      const {
        amount,
        phone,
      } = req.body;

      if (
        !amount ||
        Number(amount) < 5000
      ) {
        return res.status(400).json({
          error:
            "Minimum top up is TSh 5,000",
        });
      }

      if (
        !phone ||
        typeof phone !== "string"
      ) {
        return res.status(400).json({
          error:
            "Phone number required",
        });
      }

      const result =
        await subscriptionService.topUpCard(
          req.user!.id,
          Number(amount),
          phone
        );

      res.json(result);
    } catch (error: any) {
      res.status(400).json({
        error: error.message,
      });
    }
  }
);

// Subscribe with card
router.post(
  "/subscribe-card",
  authMiddleware,
  async (req, res) => {
    try {
      const { tier } = req.body;

      if (!tier) {
        return res.status(400).json({
          error:
            "Subscription tier is required",
        });
      }

      const result =
        await subscriptionService.subscribeWithCard(
          req.user!.id,
          tier
        );

      res.json(result);
    } catch (error: any) {
      res.status(400).json({
        error: error.message,
      });
    }
  }
);

// Upgrade subscription
router.post(
  "/upgrade",
  authMiddleware,
  async (req, res) => {
    try {
      const { tier } = req.body;

      if (!tier) {
        return res.status(400).json({
          error:
            "Subscription tier is required",
        });
      }

      const result =
        await subscriptionService.upgradeSubscription(
          req.user!.id,
          tier
        );

      res.json(result);
    } catch (error: any) {
      res.status(400).json({
        error: error.message,
      });
    }
  }
);

// ============================================================
// ADMIN: CANCEL PENDING SUBSCRIPTION
// ============================================================

router.post(
  "/admin/cancel-pending/:userId",
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {
    try {
      const userId =
        getParamString(
          req.params.userId
        );

      if (!userId) {
        return res.status(400).json({
          error: "User ID is required",
        });
      }

      const updated =
        await prisma.subscription.updateMany(
          {
            where: {
              userId,
              status: "pending_payment",
            },
            data: {
              status: "cancelled",
              autoRenew: false,
              updatedAt: new Date(),
            },
          }
        );

      await prisma.subscriptionTransaction.updateMany(
        {
          where: {
            userId,
            status: "pending",
          },
          data: {
            status: "failed",
          },
        }
      );

      res.json({
        success: true,
        cancelled: updated.count,
      });
    } catch (error: any) {
      res.status(500).json({
        error: error.message,
      });
    }
  }
);

// ============================================================
// USER: CANCEL PENDING SUBSCRIPTION
// ============================================================

router.post(
  "/cancel-pending",
  authMiddleware,
  async (req, res) => {
    try {
      const userId =
        req.user!.id;

      const pendingSub =
        await prisma.subscription.findFirst({
          where: {
            userId,
            status: "pending_payment",
          },
        });

      if (!pendingSub) {
        return res.status(404).json({
          error:
            "No pending subscription found",
        });
      }

      await prisma.subscription.update({
        where: {
          id: pendingSub.id,
        },
        data: {
          status: "cancelled",
          autoRenew: false,
          updatedAt: new Date(),
        },
      });

      await prisma.subscriptionTransaction.updateMany(
        {
          where: {
            subscriptionId:
              pendingSub.id,
            status: "pending",
          },
          data: {
            status: "failed",
          },
        }
      );

      res.json({
        success: true,
        message:
          "Pending subscription cancelled. You can now subscribe again.",
      });
    } catch (error: any) {
      res.status(500).json({
        error: error.message,
      });
    }
  }
);

// ============================================================
// ADMIN: COMPLETE PENDING SUBSCRIPTION
// ============================================================

router.post(
  "/admin/complete-pending/:subscriptionId",
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {
    try {
      const subscriptionId =
        getParamString(
          req.params.subscriptionId
        );

      if (!subscriptionId) {
        return res.status(400).json({
          error:
            "Subscription ID is required",
        });
      }

      const subscription =
        await prisma.subscription.findUnique(
          {
            where: {
              id: subscriptionId,
            },
            include: {
              user: true,
            },
          }
        );

      if (!subscription) {
        return res.status(404).json({
          error:
            "Subscription not found",
        });
      }

      if (
        subscription.status !==
        "pending_payment"
      ) {
        return res.status(400).json({
          error:
            "Subscription is not pending",
        });
      }

      const updated =
        await prisma.subscription.update({
          where: {
            id: subscriptionId,
          },
          data: {
            status: "active",
            startDate: new Date(),
            endDate: new Date(
              Date.now() +
                30 * 86400000
            ),
            updatedAt: new Date(),
          },
        });

      await prisma.subscriptionTransaction.updateMany(
        {
          where: {
            subscriptionId,
            status: "pending",
          },
          data: {
            status: "completed",
          },
        }
      );

      res.json({
        success: true,
        subscription: updated,
      });
    } catch (error: any) {
      res.status(500).json({
        error: error.message,
      });
    }
  }
);

export default router;