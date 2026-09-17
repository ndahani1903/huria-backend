// src/modules/payments/payment.routes.ts

import {
  Router,
  Request,
  Response
} from "express";

import { PaymentController } from "./payment.controller";

import {
  authMiddleware
} from "../../middleware/auth.middleware";

import {
  requireRole
} from "../../middleware/role.middleware";

import {
  rateLimitMiddleware,
  authRateLimiter,
  paymentRateLimiter
} from "../../middleware/rateLimit.middleware";

import { prisma } from "../../config/db";

function getParamString(
  value: string | string[] | undefined
): string {
  if (
    typeof value === "string" &&
    value.trim().length > 0
  ) {
    return value;
  }

  throw new Error(
    "Invalid or missing route parameter"
  );
}

function getJsonObject(
  value: unknown
): Record<string, unknown> {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return {};
}

const router = Router();

// ============================================================
// TEST
// ============================================================

router.get(
  "/test",
  (
    req: Request,
    res: Response
  ) => {
    res.json({
      message:
        "Payment routes are working!"
    });
  }
);

// ============================================================
// MANUAL CONFIRM - TESTING ONLY
// ============================================================

router.post(
  "/manual-confirm-order",
  authMiddleware,
  requireRole("admin"),
  PaymentController.manualConfirmByOrderId
);

// ============================================================
// DEBUG PAYMENT METADATA
// ============================================================

router.get(
  "/debug/payment/:orderId",
  authMiddleware,
  requireRole("admin"),
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const orderId =
        getParamString(
          req.params.orderId
        );

      const payment =
        await prisma.payment.findFirst({
          where: {
            orderId
          },

          select: {
            id: true,
            orderId: true,
            status: true,
            metadata: true
          }
        });

      const metadata =
        getJsonObject(
          payment?.metadata
        );

      return res.json({
        payment,

        azamPayTransactionId:
          metadata.azamPayTransactionId,

        provider:
          metadata.provider
      });
    } catch (error: any) {
      return res.status(400).json({
        error:
          error.message
      });
    }
  }
);

// ============================================================
// AZAMPAY PAYMENT INITIATION
// ============================================================

router.post(
  "/azampay/initiate",
  authMiddleware,
  requireRole("customer"),
  paymentRateLimiter,
  PaymentController.initiateAzamPayPayment
);

// ============================================================
// CARD PAYMENT
// ============================================================

router.post(
  "/card/pay-order",
  authMiddleware,
  requireRole("customer"),
  paymentRateLimiter,
  PaymentController.payOrderWithCard
);

// ============================================================
// AZAMPAY WEBHOOK
// ============================================================

router.post(
  "/webhook/azampay",
  rateLimitMiddleware,
  PaymentController.azamPayWebhook
);

// ============================================================
// AZAMPAY STATUS
// ============================================================

router.get(
  "/azampay/status/:transactionId",
  authMiddleware,
  rateLimitMiddleware,
  PaymentController.checkAzamPayStatus
);

// ============================================================
// GENERAL PAYMENT STATUS
// ============================================================

router.get(
  "/status/:orderId",
  authMiddleware,
  rateLimitMiddleware,
  PaymentController.getPaymentStatus
);

// ============================================================
// RELEASE PAYMENT
// DRIVER ONLY
// ============================================================

router.post(
  "/release",
  authMiddleware,
  requireRole("driver"),
  paymentRateLimiter,
  PaymentController.release
);

// ============================================================
// REFUND PAYMENT
// ADMIN ONLY
// ============================================================

router.post(
  "/refund",
  authMiddleware,
  requireRole("admin"),
  paymentRateLimiter,
  PaymentController.refund
);

// ============================================================
// REFUND STATUS
// ADMIN ONLY
// ============================================================

router.get(
  "/refund-status/:orderId",
  authMiddleware,
  requireRole("admin"),
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const orderId =
        getParamString(
          req.params.orderId
        );

      /*
       * Your current Prisma Payment model does not expose
       * a `refunds` relation. Therefore we return the payment
       * status here instead of trying to access payment.refunds.
       *
       * If your schema later adds a Refund model/relation,
       * this endpoint can be extended to return those records.
       */

      const payment =
        await prisma.payment.findUnique({
          where: {
            orderId
          }
        });

      if (!payment) {
        return res.status(404).json({
          error:
            "Payment not found"
        });
      }

      return res.json({
        paymentStatus:
          payment.status,

        paymentId:
          payment.id,

        orderId:
          payment.orderId,

        transactionRef:
          payment.transactionRef,

        gatewayReference:
          payment.gatewayReference,

        completedAt:
          payment.completedAt,

        failureReason:
          payment.failureReason
      });
    } catch (error: any) {
      return res.status(500).json({
        error:
          error.message
      });
    }
  }
);

// ============================================================
// GET PAYMENT DETAILS
// ============================================================

router.get(
  "/:orderId",
  authMiddleware,
  rateLimitMiddleware,
  PaymentController.getPayment
);

export default router;