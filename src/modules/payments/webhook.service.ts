// src/modules/payments/webhook.service.ts

import { MpesaCallback } from "./types";
import { PaymentService } from "./payment.service";
import { EscrowService } from "../../services/escrow.service";
import { prisma } from "../../config/db";
import { io } from "../../server";
import { SMSService } from "../../services/sms.service";

function toJsonValue(
  value: unknown
): any {
  return JSON.parse(
    JSON.stringify(value)
  );
}

function toNumber(
  value: unknown
): number {
  if (
    value === null ||
    value === undefined
  ) {
    return 0;
  }

  if (
    typeof value === "number"
  ) {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  if (
    typeof value === "string"
  ) {
    const parsed =
      Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : 0;
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toNumber" in value &&
    typeof (
      value as {
        toNumber?: unknown;
      }
    ).toNumber === "function"
  ) {
    const result =
      (
        value as {
          toNumber: () => number;
        }
      ).toNumber();

    return Number.isFinite(result)
      ? result
      : 0;
  }

  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

export class WebhookService {
  // ============================================================
  // HANDLE M-PESA CALLBACK
  // ============================================================

  static async handleCallback(
    data: MpesaCallback
  ) {
    const callback =
      data.Body.stkCallback;

    const checkoutRequestId =
      callback.CheckoutRequestID;

    console.log(
      `📞 Webhook received for CheckoutRequestID: ${checkoutRequestId}`
    );

    console.log(
      `📞 ResultCode: ${callback.ResultCode}`
    );

    // ==========================================================
    // IDEMPOTENCY CHECK
    // ==========================================================

    const existingEvent =
      await prisma.webhookEvent.findUnique({
        where: {
          eventId:
            callback.CheckoutRequestID
        }
      });

    if (
      existingEvent &&
      existingEvent.status ===
        "processed"
    ) {
      console.log(
        `⏭️ Webhook ${checkoutRequestId} already processed, skipping`
      );

      return {
        success: true,
        message:
          "Already processed"
      };
    }

    // ==========================================================
    // EXTRACT CALLBACK DATA
    // ==========================================================

    const items =
      callback.CallbackMetadata
        ?.Item || [];

    const orderId =
      items.find(
        item =>
          item.Name ===
          "AccountReference"
      )?.Value;

    const receipt =
      items.find(
        item =>
          item.Name ===
          "MpesaReceiptNumber"
      )?.Value;

    const amount =
      items.find(
        item =>
          item.Name ===
          "Amount"
      )?.Value;

    const phoneNumber =
      items.find(
        item =>
          item.Name ===
          "PhoneNumber"
      )?.Value;

    console.log(
      `📦 Extracted - OrderId: ${orderId}, Receipt: ${receipt}, Amount: ${amount}, Phone: ${phoneNumber}`
    );

    // Convert callback into Prisma-compatible JSON.
    const jsonPayload =
      toJsonValue(data);

    // ==========================================================
    // NO ORDER ID
    // ==========================================================

    if (!orderId) {
      console.error(
        "❌ No orderId found in callback metadata"
      );

      await prisma.webhookEvent.upsert({
        where: {
          eventId:
            callback.CheckoutRequestID
        },

        update: {
          payload:
            jsonPayload,

          status:
            "failed",

          processedAt:
            new Date()
        },

        create: {
          provider:
            "mpesa",

          eventId:
            checkoutRequestId,

          payload:
            jsonPayload,

          status:
            "failed"
        }
      });

      return {
        success: false,
        error:
          "No orderId in callback"
      };
    }

    // ==========================================================
    // CREATE / UPDATE WEBHOOK EVENT
    // ==========================================================

    await prisma.webhookEvent.upsert({
      where: {
        eventId:
          checkoutRequestId
      },

      update: {
        payload:
          jsonPayload,

        status:
          "processing"
      },

      create: {
        provider:
          "mpesa",

        eventId:
          checkoutRequestId,

        payload:
          jsonPayload,

        status:
          "processing"
      }
    });

    // ==========================================================
    // PROCESS CALLBACK
    // ==========================================================

    try {
      if (
        callback.ResultCode === 0
      ) {
        // ======================================================
        // SUCCESSFUL PAYMENT
        // ======================================================

        console.log(
          `✅ Payment successful for order ${orderId}`
        );

        await prisma.$transaction(
          async tx => {
            // --------------------------------------------------
            // 1. Mark payment completed
            // --------------------------------------------------

            const payment =
              await tx.payment.update({
                where: {
                  orderId
                },

                data: {
                  status:
                    "completed",

                  transactionRef:
                    receipt
                      ? String(receipt)
                      : undefined,

                  gatewayReference:
                    receipt
                      ? String(receipt)
                      : undefined,

                  completedAt:
                    new Date(),

                  updatedAt:
                    new Date()
                }
              });

            console.log(
              `💰 Payment ${payment.id} marked as completed`
            );

            // --------------------------------------------------
            // 2. Mark order as paid
            // --------------------------------------------------

            const order =
              await tx.order.update({
                where: {
                  orderId
                },

                data: {
                  status:
                    "paid",

                  updatedAt:
                    new Date()
                },

                include: {
                  user: true
                }
              });

            console.log(
              `📦 Order ${orderId} marked as PAID`
            );

            // --------------------------------------------------
            // 3. Mark webhook processed
            // --------------------------------------------------

            await tx.webhookEvent.update({
              where: {
                eventId:
                  checkoutRequestId
              },

              data: {
                status:
                  "processed",

                processedAt:
                  new Date()
              }
            });

            // --------------------------------------------------
            // 4. Send SMS
            // --------------------------------------------------

            if (
              order.user?.phone
            ) {
              await SMSService.sendPaymentReceived(
                order.user.phone,
                orderId,
                toNumber(
                  amount ||
                    order.amount
                )
              );
            }
          }
        );

        // ======================================================
        // HOLD PAYMENT IN ESCROW
        // ======================================================

        try {
          const order =
            await prisma.order.findUnique({
              where: {
                orderId
              },

              select: {
                amount: true,
                userId: true
              }
            });

          if (order) {
            await EscrowService.holdPayment(
              orderId,
              toNumber(
                order.amount
              ),
              order.userId
            );

            console.log(
              `🔒 Escrow held for order ${orderId}`
            );
          }
        } catch (
          escrowError
        ) {
          console.error(
            `⚠️ Escrow hold failed for ${orderId}:`,
            escrowError
          );

          // Payment is already confirmed,
          // so don't fail the webhook.
        }

        // ======================================================
        // REAL-TIME UPDATE
        // ======================================================

        io.emit(
          "order:update",
          {
            orderId,
            status: "paid",
            paymentStatus:
              "completed"
          }
        );

        return {
          success: true,
          orderId,
          status: "paid"
        };
      }

      // ========================================================
      // FAILED PAYMENT
      // ========================================================

      console.log(
        `❌ Payment failed for order ${orderId}: ResultCode ${callback.ResultCode}`
      );

      await prisma.$transaction(
        async tx => {
          // ----------------------------------------------------
          // 1. Mark payment failed
          // ----------------------------------------------------

          await tx.payment.update({
            where: {
              orderId
            },

            data: {
              status:
                "failed",

              failureReason:
                `M-Pesa ResultCode: ${callback.ResultCode}`,

              updatedAt:
                new Date()
            }
          });

          // ----------------------------------------------------
          // 2. Mark webhook failed
          // ----------------------------------------------------

          await tx.webhookEvent.update({
            where: {
              eventId:
                checkoutRequestId
            },

            data: {
              status:
                "failed",

              processedAt:
                new Date()
            }
          });
        }
      );

      // ========================================================
      // EMIT PAYMENT FAILURE
      // ========================================================

      io.emit(
        "order:payment-failed",
        {
          orderId,

          reason:
            "Payment failed. Please try again."
        }
      );

      return {
        success: false,
        orderId,
        status: "failed",
        resultCode:
          callback.ResultCode
      };
    } catch (error: any) {
      console.error(
        `💥 Webhook processing error for ${orderId}:`,
        error
      );

      // ========================================================
      // MARK WEBHOOK FAILED
      // ========================================================

      await prisma.webhookEvent.update({
        where: {
          eventId:
            checkoutRequestId
        },

        data: {
          status:
            "failed",

          processedAt:
            new Date()
        }
      });

      throw error;
    }
  }

  // ============================================================
  // VERIFY M-PESA WEBHOOK SIGNATURE
  // ============================================================

  static verifySignature(
    signature: string,
    body: any,
    secret: string
  ): boolean {
    const crypto =
      require("crypto");

    const expectedSignature =
      crypto
        .createHmac(
          "sha256",
          secret
        )
        .update(
          JSON.stringify(body)
        )
        .digest("base64");

    return (
      signature ===
      expectedSignature
    );
  }

  // ============================================================
  // RETRY FAILED WEBHOOK
  // ============================================================

  static async retryFailedWebhook(
    eventId: string
  ): Promise<any> {
    const event =
      await prisma.webhookEvent.findUnique(
        {
          where: {
            eventId
          }
        }
      );

    if (!event) {
      throw new Error(
        "Webhook event not found"
      );
    }

    if (
      event.status !==
      "failed"
    ) {
      throw new Error(
        "Only failed webhooks can be retried"
      );
    }

    /*
     * Prisma JsonValue is broader than MpesaCallback.
     * Convert it to unknown first, then to the application
     * callback type.
     */
    const callback =
      event.payload as unknown as MpesaCallback;

    return this.handleCallback(
      callback
    );
  }

  // ============================================================
  // GET PENDING / FAILED WEBHOOKS
  // ============================================================

  static async getPendingWebhooks(
    limit: number = 100
  ) {
    return prisma.webhookEvent.findMany({
      where: {
        status: {
          in: [
            "pending",
            "failed"
          ]
        }
      },

      orderBy: {
        createdAt: "asc"
      },

      take: limit
    });
  }
}