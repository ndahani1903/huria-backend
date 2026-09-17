// src/modules/payments/payment.controller.ts

import { Request, Response } from "express";
import { AzamPayService } from "../../services/azampay.service";
import { PaymentService } from "./payment.service";
import { prisma } from "../../config/db";
import { stkPushSchema } from "./payment.validator";
import { AuthRequest } from "../../middleware/auth.middleware";
import { SubscriptionService } from "../subscription/subscription.service";

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

export class PaymentController {
  // ============================================================
  // MANUAL CONFIRM ORDER - TESTING ONLY
  // ============================================================

  static async manualConfirmByOrderId(
    req: AuthRequest,
    res: Response
  ) {
    try {
      const { orderId } = req.body;

      if (!orderId) {
        return res.status(400).json({
          error: "Order ID required"
        });
      }

      const payment =
        await prisma.payment.findUnique({
          where: { orderId }
        });

      if (!payment) {
        return res.status(404).json({
          error: "Payment not found"
        });
      }

      if (
        payment.status === "completed"
      ) {
        return res.json({
          success: true,
          message:
            "Payment already completed"
        });
      }

      const mockTransactionId =
        `MANUAL_${Date.now()}`;

      await PaymentService.markCompleted(
        orderId,
        mockTransactionId
      );

      await prisma.order.update({
        where: {
          id: payment.orderId
        },
        data: {
          status: "paid"
        }
      });

      return res.json({
        success: true,
        message:
          "Payment confirmed manually",
        mockTransactionId
      });
    } catch (error: any) {
      console.error(
        "Manual confirm error:",
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }
  }

  // ============================================================
  // AZAMPAY INITIATE PAYMENT
  // ============================================================

  static async initiateAzamPayPayment(
    req: AuthRequest,
    res: Response
  ) {
    console.log(
      "🔥🔥🔥 AZAMPAY PAYMENT INITIATED 🔥🔥🔥"
    );
    console.log("Body:", req.body);
    console.log("User:", req.user);

    try {
      const data =
        stkPushSchema.parse(
          req.body
        );

      const {
        orderId,
        amount,
        phone
      } = data;

      const order =
        await prisma.order.findUnique({
          where: {
            id: orderId
          },
          include: {
            user: true
          }
        });

      if (!order) {
        console.error(
          "❌ Order not found with UUID:",
          orderId
        );

        return res.status(404).json({
          error: "Order not found"
        });
      }

      console.log(
        "✅ Order found:",
        order.orderId,
        "UUID:",
        order.id
      );

      if (
        order.status === "paid" ||
        order.status === "completed"
      ) {
        return res.status(400).json({
          error:
            "ORDER_ALREADY_PAID",
          message:
            "This order has already been paid for. Please check your orders list."
        });
      }

      let paymentAmount = amount;

      if (
        !paymentAmount ||
        paymentAmount <= 0
      ) {
        paymentAmount =
          Number(
            order.finalAmount ||
            order.amount
          );
      }

      const userPhone =
        phone ||
        order.user?.phone;

      if (!userPhone) {
        return res.status(400).json({
          error:
            "Phone number required"
        });
      }

      let provider:
        | "Airtel"
        | "Tigo"
        | "Halopesa"
        | "Azampesa"
        | "Mpesa" =
        "Mpesa";

      let cleanPhone =
        userPhone
          .replace(/\s/g, "")
          .replace(/^\+/, "");

      while (
        cleanPhone.startsWith("0")
      ) {
        cleanPhone =
          cleanPhone.substring(1);
      }

      if (
        !cleanPhone.startsWith("255")
      ) {
        cleanPhone =
          "255" + cleanPhone;
      }

      const phonePrefix =
        cleanPhone.substring(
          3,
          7
        );

      if (
        phonePrefix.startsWith("62") ||
        phonePrefix.startsWith("63") ||
        phonePrefix.startsWith("64")
      ) {
        provider = "Halopesa";
      } else if (
        phonePrefix.startsWith("65") ||
        phonePrefix.startsWith("67") ||
        phonePrefix.startsWith("71")
      ) {
        provider = "Tigo";
      } else if (
        phonePrefix.startsWith("68") ||
        phonePrefix.startsWith("69") ||
        phonePrefix.startsWith("78")
      ) {
        provider = "Airtel";
      } else if (
        phonePrefix.startsWith("74") ||
        phonePrefix.startsWith("75") ||
        phonePrefix.startsWith("76")
      ) {
        provider = "Mpesa";
      }

      console.log(
        `📱 Detected provider: ${provider} for phone: ${cleanPhone} (prefix: ${phonePrefix})`
      );

      const paymentResult =
        await PaymentService.initiatePayment(
          orderId,
          userPhone,
          paymentAmount
        );

      const azamPayResult =
        await AzamPayService.initiatePayment(
          paymentAmount,
          userPhone,
          order.orderId,
          order.user?.name ||
            "Customer",
          provider
        );

      console.log(
        "📦 AzamPay result:",
        JSON.stringify(
          azamPayResult,
          null,
          2
        )
      );

      const existingMetadata =
        getJsonObject(
          paymentResult.payment
            .metadata
        );

      await prisma.payment.update({
        where: {
          id:
            paymentResult.payment.id
        },
        data: {
          metadata: {
            ...existingMetadata,

            azamPayTransactionId:
              azamPayResult.transactionId ||
              azamPayResult.referenceId,

            provider:
              "azampay",

            phoneNumber:
              userPhone,

            network:
              provider
          }
        }
      });

      return res.json({
        success: true,

        paymentId:
          paymentResult.payment.id,

        transactionId:
          azamPayResult.transactionId ||
          azamPayResult.referenceId ||
          "pending",

        status:
          paymentResult.payment.status,

        provider,

        message:
          `STK push sent to ${userPhone}. Please check your phone and enter PIN.`
      });
    } catch (error: any) {
      console.error(
        "AzamPay payment error:",
        error
      );

      if (
        error.message ===
        "PAYMENT_ALREADY_COMPLETED"
      ) {
        return res.status(400).json({
          error:
            "PAYMENT_ALREADY_COMPLETED",
          message:
            "This order has already been paid for successfully."
        });
      }

      if (
        error.message ===
        "PAYMENT_ALREADY_PENDING"
      ) {
        return res.status(400).json({
          error:
            "PAYMENT_ALREADY_PENDING",
          message:
            "A payment for this order is already in progress. Please wait or check your orders."
        });
      }

      if (
        error.code === "P2002"
      ) {
        return res.status(400).json({
          error:
            "DUPLICATE_PAYMENT",
          message:
            "A payment record for this order already exists. Please refresh and check your order status."
        });
      }

      return res.status(500).json({
        success: false,
        error:
          error.message ||
          "Payment initiation failed"
      });
    }
  }

  // ============================================================
  // CARD PAYMENT
  // ============================================================

  static async payOrderWithCard(
    req: AuthRequest,
    res: Response
  ) {
    try {
      const userId =
        req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized"
        });
      }

      const { orderId } =
        req.body;

      if (!orderId) {
        return res.status(400).json({
          success: false,
          message:
            "Order ID is required"
        });
      }

      // SubscriptionService is a class,
      // so instantiate it before using instance methods.
      const subscriptionService =
        new SubscriptionService();

      const result =
        await subscriptionService.payOrderWithCard(
          userId,
          orderId
        );

      return res.json(result);
    } catch (error: any) {
      console.error(
        "Card payment error:",
        error
      );

      return res.status(400).json({
        success: false,
        message:
          error.message ||
          "Card payment failed"
      });
    }
  }

  // ============================================================
  // AZAMPAY WEBHOOK
  // ============================================================

  static async azamPayWebhook(
    req: Request,
    res: Response
  ) {
    try {
      const payload =
        req.body;

      console.log(
        "📞 AzamPay Webhook received:",
        payload
      );

      if (
        payload.status ===
        "SUCCESS"
      ) {
        const {
          merchantReference,
          transactionId,
          amount
        } = payload;

        console.log(
          "Merchant reference:",
          merchantReference
        );

        console.log(
          "Transaction ID:",
          transactionId
        );

        console.log(
          "Amount:",
          amount
        );

        const payment =
          await prisma.payment.findFirst({
            where: {
              metadata: {
                path: [
                  "azamPayTransactionId"
                ],
                equals:
                  transactionId
              }
            }
          });

        if (payment) {
          await PaymentService.markCompleted(
            payment.orderId,
            transactionId
          );

          console.log(
            `✅ Payment confirmed via webhook for order ${payment.orderId}`
          );
        } else {
          console.warn(
            `⚠️ Payment not found for transaction: ${transactionId}`
          );
        }
      } else if (
        payload.status ===
        "FAILED"
      ) {
        console.log(
          `❌ Payment failed: ${
            payload.failureReason ||
            "Unknown reason"
          }`
        );
      }

      return res
        .status(200)
        .json({
          status: "success"
        });
    } catch (error) {
      console.error(
        "Webhook error:",
        error
      );

      return res
        .status(200)
        .json({
          status: "ok"
        });
    }
  }

  // ============================================================
  // CHECK AZAMPAY STATUS
  // ============================================================

  static async checkAzamPayStatus(
    req: Request,
    res: Response
  ) {
    try {
      const transactionId =
        getParamString(
          req.params.transactionId
        );

      const status =
        await AzamPayService.checkStatus(
          transactionId
        );

      if (
        status.status ===
        "SUCCESS"
      ) {
        const payment =
          await prisma.payment.findFirst({
            where: {
              metadata: {
                path: [
                  "azamPayTransactionId"
                ],
                equals:
                  transactionId
              }
            }
          });

        if (
          payment &&
          payment.status !==
            "completed"
        ) {
          await PaymentService.markCompleted(
            payment.orderId,
            transactionId
          );
        }
      }

      return res.json({
        success: true,
        status:
          status.status,
        transactionId
      });
    } catch (error: any) {
      console.error(
        "Status check error:",
        error
      );

      return res.status(500).json({
        error:
          error.message
      });
    }
  }

  // ============================================================
  // GET PAYMENT STATUS
  // ============================================================

  static async getPaymentStatus(
    req: Request,
    res: Response
  ) {
    try {
      const orderId =
        getParamString(
          req.params.orderId
        );

      const payment =
        await PaymentService.getByOrderId(
          orderId
        );

      const order =
        await prisma.order.findUnique({
          where: {
            id: orderId
          },
          select: {
            status: true
          }
        });

      if (!payment) {
        return res.status(404).json({
          status:
            "not_found",
          message:
            "No payment record found for this order"
        });
      }

      return res.json({
        orderId,
        paymentStatus:
          payment.status,
        orderStatus:
          order?.status,
        completedAt:
          payment.completedAt,
        transactionRef:
          payment.transactionRef,
        failureReason:
          payment.failureReason
      });
    } catch (error: any) {
      console.error(
        "Payment status error:",
        error
      );

      return res.status(500).json({
        error:
          "Failed to fetch payment status"
      });
    }
  }

  // ============================================================
  // RELEASE PAYMENT
  // ============================================================

  static async release(
    req: AuthRequest,
    res: Response
  ) {
    try {
      const {
        orderId,
        otp
      } = req.body;

      if (!orderId || !otp) {
        return res.status(400).json({
          error:
            "Order ID and OTP required"
        });
      }

      const result =
        await PaymentService.release(
          orderId,
          otp
        );

      return res.json({
        success: true,
        payment: result
      });
    } catch (error: any) {
      console.error(
        "Release error:",
        error
      );

      return res.status(500).json({
        error:
          error.message ||
          "Release failed"
      });
    }
  }

  // ============================================================
  // REFUND PAYMENT
  // ============================================================

  static async refund(
    req: AuthRequest,
    res: Response
  ) {
    try {
      const { orderId } =
        req.body;

      if (!orderId) {
        return res.status(400).json({
          error:
            "Order ID required"
        });
      }

      /*
       * PaymentService.refund() is the payment-layer refund.
       *
       * Your current SubscriptionService does NOT expose
       * refundCardPurchase() according to the generated
       * TypeScript type. Therefore we do not call a method
       * that does not exist.
       *
       * If/when refundCardPurchase() is added to
       * SubscriptionService, it can be integrated here.
       */

      const paymentRefund =
        await PaymentService.refund(
          orderId
        );

      return res.json({
        success: true,
        refund:
          paymentRefund
      });
    } catch (error: any) {
      console.error(
        "Refund error:",
        error
      );

      return res.status(400).json({
        success: false,
        error:
          error.message ||
          "Refund failed"
      });
    }
  }

  // ============================================================
  // GET PAYMENT DETAILS
  // ============================================================

  static async getPayment(
    req: Request,
    res: Response
  ) {
    try {
      const orderId =
        getParamString(
          req.params.orderId
        );

      const payment =
        await PaymentService.get(
          orderId
        );

      if (!payment) {
        return res.status(404).json({
          error:
            "Payment not found"
        });
      }

      return res.json(payment);
    } catch (error: any) {
      console.error(
        "Get payment error:",
        error
      );

      return res.status(500).json({
        error:
          "Failed to fetch payment"
      });
    }
  }
}