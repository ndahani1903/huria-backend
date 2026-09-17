// src/modules/orders/priorityOrder.service.ts

import { prisma } from "../../config/db";
import { io } from "../../server";
import { SMSService } from "../../services/sms.service";

export class PriorityOrderService {
  // Track escalation state
  private static escalationTimeouts = new Map<
    string,
    NodeJS.Timeout[]
  >();

  // ============================================================
  // PROCESS RESTAURANT ORDER
  // 5 minute acceptance window
  // ============================================================

  static async processRestaurantOrder(
    orderId: string
  ) {
    console.log(
      `🍔 Processing restaurant order ${orderId} with priority`
    );

    const order =
      await prisma.order.findUnique({
        where: {
          orderId
        },
        include: {
          merchant: true,
          items: {
            include: {
              product: true
            }
          },
          user: true
        }
      });

    if (
      !order ||
      order.merchant?.merchantType !==
        "RESTAURANT"
    ) {
      console.log(
        `⚠️ Not a restaurant order: ${orderId}`
      );

      return null;
    }

    // Set deadlines
    const acceptanceDeadline =
      new Date(
        Date.now() + 5 * 60 * 1000
      );

    const escalationDeadline =
      new Date(
        Date.now() + 10 * 60 * 1000
      );

    const urgentDeadline =
      new Date(
        Date.now() + 15 * 60 * 1000
      );

    await prisma.order.update({
      where: {
        orderId: order.orderId
      },

      data: {
        orderPriority: "HIGH",

        acceptanceDeadline,

        metadata: {
          ...((order.metadata as any) || {}),
          escalationStage: "pending",
          adminNotifiedAt: null,
          urgentNotifiedAt: null
        }
      }
    });

    const totalAmount =
      order.finalAmount ||
      order.amount;

    // Emit to merchant dashboard
    io.to(
      `merchant:${order.merchantId}`
    ).emit(
      "new_restaurant_order",
      {
        orderId: order.orderId,
        totalAmount:
          Number(totalAmount),
        acceptanceDeadline:
          acceptanceDeadline.toISOString(),
        isUrgent: true,
        customerName:
          order.user?.name ||
          "Customer",
        createdAt:
          order.createdAt
      }
    );

    // Send SMS to merchant
    if (order.merchant?.phone) {
      await SMSService.sendRealSMS(
        order.merchant.phone,
        `🍔 NEW ORDER #${order.orderId.slice(
          -8
        )}! Total: TSh ${Number(
          totalAmount
        ).toLocaleString()}. Accept within 5 minutes in your dashboard.`
      );
    }

    // Schedule escalation
    const escalationTimeout =
      setTimeout(
        async () => {
          await this.escalateToAdmin(
            order.orderId
          );
        },
        5 * 60 * 1000
      );

    // Schedule urgent escalation
    const urgentTimeout =
      setTimeout(
        async () => {
          await this.urgentEscalation(
            order.orderId
          );
        },
        10 * 60 * 1000
      );

    // Store timeouts for cleanup
    this.escalationTimeouts.set(
      order.orderId,
      [
        escalationTimeout,
        urgentTimeout
      ]
    );

    console.log(
      `✅ Restaurant order ${orderId} - Acceptance: 5min, Escalation: 10min, Urgent: 15min`
    );

    return {
      acceptanceDeadline,
      escalationDeadline,
      urgentDeadline
    };
  }

  // ============================================================
  // ESCALATE TO ADMIN
  // ============================================================

  private static async escalateToAdmin(
    orderId: string
  ) {
    const order =
      await prisma.order.findUnique({
        where: {
          orderId
        },
        include: {
          merchant: true,
          user: true
        }
      });

    if (!order) {
      return;
    }

    // Check if already accepted
    if (order.status !== "paid") {
      console.log(
        `Order ${orderId} already ${order.status}, skipping escalation`
      );

      this.cleanupTimeouts(
        orderId
      );

      return;
    }

    console.log(
      `🚨 ESCALATING order ${orderId} to admin - merchant not responding`
    );

    // Update order metadata
    await prisma.order.update({
      where: {
        orderId
      },

      data: {
        metadata: {
          ...((order.metadata as any) ||
            {}),
          escalationStage:
            "admin_notified",
          adminNotifiedAt:
            new Date().toISOString()
        }
      }
    });

    // Add to admin escalation queue
    await prisma.adminEscalationQueue.upsert(
      {
        where: {
          orderId
        },

        update: {
          status: "pending",
          updatedAt: new Date()
        },

        create: {
          orderId,
          merchantId:
            order.merchantId,
          merchantName:
            order.merchant?.businessName ||
            order.merchant?.name,
          merchantPhone:
            order.merchant?.phone ||
            "",
          reason:
            "merchant_not_responding",
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }
    );

    // Notify admin dashboard
    io.emit(
      "admin:order-escalated",
      {
        orderId:
          order.orderId,
        merchantName:
          order.merchant?.businessName ||
          order.merchant?.name,
        merchantPhone:
          order.merchant?.phone,
        customerName:
          order.user?.name,
        customerPhone:
          order.user?.phone,
        amount:
          order.finalAmount ||
          order.amount,
        reason:
          "merchant_not_responding",
        actionRequired:
          "Call merchant immediately",
        escalatedAt:
          new Date().toISOString()
      }
    );

    // Send SMS reminder to merchant
    if (order.merchant?.phone) {
      await SMSService.sendRealSMS(
        order.merchant.phone,
        `⏰ URGENT: Order #${order.orderId.slice(
          -8
        )} requires your attention! Please accept in dashboard or call support.`
      );
    }

    // Notify admin via SMS
    await this.notifyAdminViaSMS(
      order,
      "escalated"
    );
  }

  // ============================================================
  // URGENT ESCALATION
  // ============================================================

  private static async urgentEscalation(
    orderId: string
  ) {
    const order =
      await prisma.order.findUnique({
        where: {
          orderId
        },
        include: {
          merchant: true,
          user: true
        }
      });

    if (!order) {
      return;
    }

    // Check if already accepted
    if (order.status !== "paid") {
      console.log(
        `Order ${orderId} already ${order.status}, skipping urgent escalation`
      );

      this.cleanupTimeouts(
        orderId
      );

      return;
    }

    console.log(
      `🔥 URGENT ESCALATION for order ${orderId} - admin must take action`
    );

    // Update order metadata
    await prisma.order.update({
      where: {
        orderId
      },

      data: {
        metadata: {
          ...((order.metadata as any) ||
            {}),
          escalationStage: "urgent",
          urgentNotifiedAt:
            new Date().toISOString()
        }
      }
    });

    // Update escalation queue
    await prisma.adminEscalationQueue.update(
      {
        where: {
          orderId
        },

        data: {
          status: "urgent",
          updatedAt: new Date()
        }
      }
    );

    // Add to urgent admin tasks
    await prisma.urgentAdminTasks.upsert(
      {
        where: {
          orderId
        },

        update: {
          status: "pending",
          updatedAt: new Date()
        },

        create: {
          orderId,
          type:
            "merchant_no_response",
          priority: "HIGH",
          status: "pending",
          createdAt: new Date(),
          updatedAt: new Date()
        }
      }
    );

    // Notify admin
    io.emit(
      "admin:order-urgent",
      {
        orderId:
          order.orderId,
        merchantName:
          order.merchant?.businessName ||
          order.merchant?.name,
        merchantPhone:
          order.merchant?.phone,
        customerName:
          order.user?.name,
        customerPhone:
          order.user?.phone,
        amount:
          order.finalAmount ||
          order.amount,
        waitingMinutes: 10,
        actionRequired:
          "Immediate action required - call merchant or reassign",
        escalatedAt:
          new Date().toISOString()
      }
    );

    // Notify admin via SMS
    await this.notifyAdminViaSMS(
      order,
      "urgent"
    );
  }

  // ============================================================
  // MERCHANT ACCEPTS ORDER
  // ============================================================

  static async acceptOrder(
    orderId: string,
    merchantId: string,
    estimatedReadyTime?: number
  ) {
    return await prisma.$transaction(
      async (tx) => {
        const order =
          await tx.order.findFirst({
            where: {
              orderId,
              merchantId
            },

            include: {
              merchant: true,
              user: true
            }
          });

        if (!order) {
          throw new Error(
            "Order not found or unauthorized"
          );
        }

        if (order.status !== "paid") {
          throw new Error(
            `Cannot accept order with status: ${order.status}`
          );
        }

        // Clear escalation timeouts
        this.cleanupTimeouts(
          orderId
        );

        const preparationTime =
          estimatedReadyTime ||
          order.merchant
            ?.preparationTime ||
          30;

        const estimatedReadyAt =
          new Date(
            Date.now() +
              preparationTime *
                60 *
                1000
          );

        const updated =
          await tx.order.update({
            where: {
              orderId
            },

            data: {
              status: "assigned",
              tripStage: "assigned",
              acceptedAt:
                new Date(),
              estimatedReadyTime:
                estimatedReadyAt,
              preparationStartedAt:
                new Date(),

              metadata: {
                ...((order.metadata as any) ||
                  {}),
                escalationStage:
                  "accepted",
                acceptedAfterMinutes:
                  Math.floor(
                    (Date.now() -
                      new Date(
                        order.createdAt
                      ).getTime()) /
                      60000
                  )
              }
            }
          });

        // Remove from escalation queue
        await tx.adminEscalationQueue.deleteMany(
          {
            where: {
              orderId
            }
          }
        );

        await tx.urgentAdminTasks.deleteMany(
          {
            where: {
              orderId
            }
          }
        );

        // Add to manual dispatch queue
        await tx.manualDispatchQueue.upsert(
          {
            where: {
              orderId
            },

            update: {
              status: "pending",
              updatedAt: new Date()
            },

            create: {
              orderId,
              merchantId:
                order.merchantId,
              merchantType:
                "RESTAURANT",
              status: "pending",
              createdAt:
                new Date(),
              updatedAt:
                new Date()
            }
          }
        );

        // Notify admin
        io.emit(
          "admin:new-manual-dispatch",
          {
            orderId,
            merchantType:
              "RESTAURANT",
            merchantName:
              order.merchant?.businessName ||
              order.merchant?.name,
            amount:
              order.finalAmount ||
              order.amount,
            estimatedReadyTime:
              estimatedReadyAt.toISOString(),
            message: `Restaurant order needs driver assignment. Ready at ${estimatedReadyAt.toLocaleTimeString()}`
          }
        );

        // Notify customer
        if (order.user?.phone) {
          const waitTimeMinutes =
            Math.floor(
              (Date.now() -
                new Date(
                  order.createdAt
                ).getTime()) /
                60000
            );

          let message =
            `✅ Order #${order.orderId.slice(
              -8
            )} accepted! Ready in ${preparationTime} minutes.`;

          if (waitTimeMinutes > 5) {
            message =
              `✅ Order #${order.orderId.slice(
                -8
              )} has been accepted (${waitTimeMinutes} min delay). Ready in ${preparationTime} minutes. Thank you for your patience!`;
          }

          await SMSService.sendRealSMS(
            order.user.phone,
            message
          );
        }

        // Socket updates
        io.to(
          `user:${order.userId}`
        ).emit(
          "order_accepted",
          {
            orderId:
              order.orderId,
            estimatedReadyTime:
              estimatedReadyAt.toISOString(),
            preparationTime
          }
        );

        io.to(
          `merchant:${merchantId}`
        ).emit(
          "order_accepted",
          {
            orderId:
              order.orderId,
            estimatedReadyTime:
              estimatedReadyAt.toISOString()
          }
        );

        return updated;
      }
    );
  }

  // ============================================================
  // MERCHANT REJECTS ORDER
  // ============================================================

  static async rejectOrder(
    orderId: string,
    merchantId: string,
    reason: string
  ) {
    return await prisma.$transaction(
      async (tx) => {
        const order =
          await tx.order.findFirst({
            where: {
              orderId,
              merchantId
            },

            include: {
              merchant: true,
              user: true
            }
          });

        if (!order) {
          throw new Error(
            "Order not found or unauthorized"
          );
        }

        if (order.status !== "paid") {
          throw new Error(
            `Cannot reject order with status: ${order.status}`
          );
        }

        this.cleanupTimeouts(
          orderId
        );

        // Keep paid and escalate
        await tx.order.update({
          where: {
            orderId
          },

          data: {
            status: "paid",
            rejectionReason:
              reason,
            rejectedAt:
              new Date(),

            metadata: {
              ...((order.metadata as any) ||
                {}),
              merchantRejected:
                true,
              rejectionReason:
                reason,
              needsAdminReview:
                true,
              escalationStage:
                "merchant_rejected"
            }
          }
        });

        // Add to admin escalation queue
        await tx.adminEscalationQueue.upsert(
          {
            where: {
              orderId
            },

            update: {
              reason,
              status: "pending",
              updatedAt:
                new Date()
            },

            create: {
              orderId,
              merchantId:
                order.merchantId,
              merchantName:
                order.merchant?.businessName ||
                order.merchant?.name,
              merchantPhone:
                order.merchant?.phone ||
                "",
              reason,
              status: "pending",
              createdAt:
                new Date(),
              updatedAt:
                new Date()
            }
          }
        );

        // Notify admin
        io.emit(
          "admin:merchant-rejected-order",
          {
            orderId:
              order.orderId,
            merchantName:
              order.merchant?.businessName ||
              order.merchant?.name,
            reason,
            customerName:
              order.user?.name,
            customerPhone:
              order.user?.phone,
            amount:
              order.finalAmount ||
              order.amount,
            actionRequired:
              "Review rejection - reassign or cancel with compensation"
          }
        );

        // Notify customer
        if (order.user?.phone) {
          await SMSService.sendRealSMS(
            order.user.phone,
            `⚠️ Order #${order.orderId.slice(
              -8
            )} was rejected by the restaurant. We are looking for an alternative restaurant for you. You will be updated shortly.`
          );
        }

        return {
          success: true,
          message:
            "Rejection escalated to admin for review"
        };
      }
    );
  }

  // ============================================================
  // MARK ORDER READY FOR PICKUP
  // ============================================================

  static async markOrderReady(
    orderId: string,
    merchantId: string
  ) {
    return await prisma.$transaction(
      async (tx) => {
        const order =
          await tx.order.findFirst({
            where: {
              orderId,
              merchantId
            },

            include: {
              merchant: true,
              user: true
            }
          });

        if (!order) {
          throw new Error(
            "Order not found or unauthorized"
          );
        }

        // Restaurant orders after acceptance are assigned.
        // Supermarket orders can still be paid.
        if (
          order.status !== "assigned" &&
          order.status !== "paid"
        ) {
          throw new Error(
            `Cannot mark order ready with status: ${order.status}`
          );
        }

        const updated =
          await tx.order.update({
            where: {
              orderId
            },

            data: {
              status:
                "ready_for_pickup",
              tripStage:
                "ready_for_pickup",
              readyForPickupAt:
                new Date(),
              preparationCompletedAt:
                new Date(),
              driverId: null
            }
          });

        // Add to manual dispatch queue
        await tx.manualDispatchQueue.upsert(
          {
            where: {
              orderId
            },

            update: {
              status: "pending",
              updatedAt:
                new Date()
            },

            create: {
              orderId,
              merchantId:
                order.merchantId,
              merchantType:
                order.merchant
                  ?.merchantType ===
                "RESTAURANT"
                  ? "RESTAURANT"
                  : "SUPERMARKET",
              status: "pending",
              createdAt:
                new Date(),
              updatedAt:
                new Date()
            }
          }
        );

        // Notify admin
        io.emit(
          "admin:restaurant-order-ready",
          {
            orderId:
              order.orderId,
            merchantName:
              order.merchant?.businessName ||
              order.merchant?.name,
            readyAt:
              new Date().toISOString(),
            message:
              "Order ready for pickup - assign driver now"
          }
        );

        // Notify customer
        if (order.user?.phone) {
          await SMSService.sendRealSMS(
            order.user.phone,
            `🍔 Order #${order.orderId.slice(
              -8
            )} is ready for pickup! A driver will be assigned shortly.`
          );
        }

        io.to(
          `user:${order.userId}`
        ).emit(
          "order_ready",
          {
            orderId:
              order.orderId
          }
        );

        return updated;
      }
    );
  }

  // ============================================================
  // ADMIN: MARK MERCHANT AS NOTIFIED
  // ============================================================

  static async markMerchantNotified(
    orderId: string,
    adminId: string,
    notes: string
  ) {
    return await prisma.$transaction(
      async (tx) => {
        await tx.adminEscalationQueue.update(
          {
            where: {
              orderId
            },

            data: {
              status:
                "merchant_contacted",
              adminNotes: notes,
              contactedAt:
                new Date(),
              contactedBy:
                adminId,
              updatedAt:
                new Date()
            }
          }
        );

        await tx.auditLog.create({
          data: {
            adminId,
            action:
              "MERCHANT_NOTIFIED",
            targetType: "order",
            targetId: orderId,
            meta: {
              notes
            }
          }
        });

        io.emit(
          "admin:merchant-notified",
          {
            orderId,
            notifiedAt:
              new Date().toISOString(),
            notes
          }
        );

        return {
          success: true
        };
      }
    );
  }

  // ============================================================
  // ADMIN: REASSIGN TO ALTERNATE RESTAURANT
  // ============================================================

  static async reassignToAlternateRestaurant(
    orderId: string,
    newMerchantId: string,
    adminId: string
  ) {
    return await prisma.$transaction(
      async (tx) => {
        const order =
          await tx.order.findUnique({
            where: {
              orderId
            },

            include: {
              items: {
                include: {
                  product: true
                }
              },
              user: true,
              merchant: true
            }
          });

        if (!order) {
          throw new Error(
            "Order not found"
          );
        }

        const newMerchant =
          await tx.merchant.findUnique({
            where: {
              id: newMerchantId
            },

            include: {
              products: true
            }
          });

        if (
          !newMerchant ||
          newMerchant.merchantType !==
            "RESTAURANT"
        ) {
          throw new Error(
            "Invalid alternate restaurant"
          );
        }

        // Check if new merchant has ordered items
        const orderedProductNames =
          order.items.map(
            (item) =>
              item.product.name.toLowerCase()
          );

        const merchantProductNames =
          newMerchant.products.map(
            (product) =>
              product.name.toLowerCase()
          );

        const missingItems =
          orderedProductNames.filter(
            (itemName) =>
              !merchantProductNames.some(
                (productName) =>
                  productName.includes(
                    itemName
                  ) ||
                  itemName.includes(
                    productName
                  )
              )
          );

        if (missingItems.length > 0) {
          if (order.user?.phone) {
            await SMSService.sendRealSMS(
              order.user.phone,
              `🔄 Alternative restaurant found but missing: ${missingItems.join(
                ", "
              )}. A support agent will contact you shortly.`
            );
          }

          await tx.pendingReassignments.upsert(
            {
              where: {
                orderId
              },

              update: {
                newMerchantId,
                missingItems,
                status:
                  "awaiting_customer_approval",
                updatedAt:
                  new Date()
              },

              create: {
                orderId,
                newMerchantId,
                missingItems,
                status:
                  "awaiting_customer_approval",
                createdAt:
                  new Date(),
                updatedAt:
                  new Date()
              }
            }
          );

          return {
            success: false,
            requiresCustomerApproval:
              true,
            missingItems,
            message:
              "Customer approval required for missing items"
          };
        }

        // Proceed with reassignment
        await tx.order.update({
          where: {
            orderId
          },

          data: {
            merchantId:
              newMerchantId,

            metadata: {
              ...((order.metadata as any) ||
                {}),
              reassignedFrom:
                order.merchantId,
              reassignedBy:
                adminId,
              reassignedAt:
                new Date().toISOString(),
              reassignReason:
                "original_merchant_no_response"
            }
          }
        });

        // Remove escalation queues
        await tx.adminEscalationQueue.deleteMany(
          {
            where: {
              orderId
            }
          }
        );

        await tx.urgentAdminTasks.deleteMany(
          {
            where: {
              orderId
            }
          }
        );

        // Notify new merchant
        io.to(
          `merchant:${newMerchantId}`
        ).emit(
          "new_restaurant_order",
          {
            orderId:
              order.orderId,

            items:
              order.items.map(
                (item) => ({
                  name:
                    item.product.name,
                  quantity:
                    item.quantity
                })
              ),

            totalAmount:
              order.finalAmount ||
              order.amount,

            isReassignment:
              true,

            originalMerchant:
              order.merchant
                ?.businessName
          }
        );

        // Notify customer
        if (order.user?.phone) {
          await SMSService.sendRealSMS(
            order.user.phone,
            `🔄 Your order #${order.orderId.slice(
              -8
            )} has been reassigned to a different restaurant to ensure faster delivery. Thank you for your understanding.`
          );
        }

        // Log admin action
        await tx.auditLog.create({
          data: {
            adminId,
            action:
              "REASSIGN_ORDER",
            targetType: "order",
            targetId: orderId,
            meta: {
              newMerchantId,
              originalMerchantId:
                order.merchantId
            }
          }
        });

        return {
          success: true,
          newMerchantId
        };
      }
    );
  }

  // ============================================================
  // ADMIN: CANCEL WITH COMPENSATION
  // ============================================================

  static async cancelWithCompensation(
    orderId: string,
    adminId: string,
    reason: string
  ) {
    return await prisma.$transaction(
      async (tx) => {
        const order =
          await tx.order.findUnique({
            where: {
              orderId
            },

            include: {
              user: true,
              merchant: true
            }
          });

        if (!order) {
          throw new Error(
            "Order not found"
          );
        }

        // Clear timeouts
        this.cleanupTimeouts(
          orderId
        );

        // Update order status
        await tx.order.update({
          where: {
            orderId
          },

          data: {
            status: "cancelled",
            rejectionReason:
              reason,
            cancelledAt:
              new Date(),

            metadata: {
              ...((order.metadata as any) ||
                {}),
              cancelledBy:
                adminId,
              cancelledAt:
                new Date().toISOString(),
              compensationEligible:
                true
            }
          }
        });

        // Remove from queues
        await tx.adminEscalationQueue.deleteMany(
          {
            where: {
              orderId
            }
          }
        );

        await tx.urgentAdminTasks.deleteMany(
          {
            where: {
              orderId
            }
          }
        );

        await tx.manualDispatchQueue.deleteMany(
          {
            where: {
              orderId
            }
          }
        );

        // Calculate compensation
        const compensationAmount =
          Number(
            order.finalAmount ||
              order.amount
          ) * 0.1;

        // ======================================================
        // ISSUE COMPENSATION TO USER WALLET
        // ======================================================
        //
        // FIX:
        // WalletCreateInput expects the user relation rather
        // than a direct userId field in this Prisma schema.
        //

        if (compensationAmount > 0) {
  const wallet = await tx.wallet.findUnique({
    where: {
      userId: order.userId
    }
  });

  if (!wallet) {
    throw new Error(
      `Cannot apply compensation: no wallet exists for user ${order.userId}`
    );
  }

  await tx.wallet.update({
    where: {
      id: wallet.id
    },
    data: {
      balance: {
        increment: compensationAmount
      },
      version: {
        increment: 1
      }
    }
  });
}

        // Notify customer
        if (order.user?.phone) {
          await SMSService.sendRealSMS(
            order.user.phone,
            `❌ We regret that order #${order.orderId.slice(
              -8
            )} could not be fulfilled. We have issued a full refund + 10% compensation credit (TSh ${compensationAmount.toLocaleString()}) to your wallet. We apologize for the inconvenience.`
          );
        }

        // Log admin action
        await tx.auditLog.create({
          data: {
            adminId,
            action:
              "CANCEL_WITH_COMPENSATION",
            targetType: "order",
            targetId: orderId,
            meta: {
              reason,
              compensationAmount
            }
          }
        });

        // Notify merchant
        if (order.merchant?.phone) {
          await SMSService.sendRealSMS(
            order.merchant.phone,
            `❌ Order #${order.orderId.slice(
              -8
            )} has been cancelled by admin due to: ${reason}. Please contact support if you have questions.`
          );
        }

        return {
          success: true,
          compensationAmount
        };
      }
    );
  }

  // ============================================================
  // GET PENDING ESCALATIONS
  // ============================================================

  static async getPendingEscalations() {
    return await prisma.adminEscalationQueue.findMany(
      {
        where: {
          status: {
            in: [
              "pending",
              "urgent"
            ]
          }
        },

        orderBy: [
          {
            status: "asc"
          },
          {
            createdAt: "asc"
          }
        ]
      }
    );
  }

  // ============================================================
  // GET ESCALATION COUNT
  // ============================================================

  static async getEscalationCount() {
    return await prisma.adminEscalationQueue.count(
      {
        where: {
          status: {
            in: [
              "pending",
              "urgent"
            ]
          }
        }
      }
    );
  }

  // ============================================================
  // AUTO-CANCEL EXPIRED ORDERS
  // Cron job
  // ============================================================

  static async autoCancelExpiredOrders() {
    const expiredOrders =
      await prisma.order.findMany({
        where: {
          status: "paid",

          merchant: {
            merchantType:
              "RESTAURANT"
          },

          acceptanceDeadline: {
            lt: new Date()
          },

          acceptedAt: null,
          rejectedAt: null
        },

        include: {
          merchant: true,
          user: true
        }
      });

    let escalatedCount = 0;

    for (const order of expiredOrders) {
      // Don't auto-cancel - escalate instead
      await this.escalateToAdmin(
        order.orderId
      );

      escalatedCount++;
    }

    if (escalatedCount > 0) {
      console.log(
        `⏰ Escalated ${escalatedCount} expired restaurant orders to admin`
      );
    }

    return escalatedCount;
  }

  // ============================================================
  // CLEANUP TIMEOUTS
  // ============================================================

  private static cleanupTimeouts(
    orderId: string
  ) {
    const timeouts =
      this.escalationTimeouts.get(
        orderId
      );

    if (timeouts) {
      timeouts.forEach(
        (timeout) =>
          clearTimeout(timeout)
      );

      this.escalationTimeouts.delete(
        orderId
      );
    }
  }

  // ============================================================
  // NOTIFY ADMIN VIA SMS
  // ============================================================

  private static async notifyAdminViaSMS(
    order: any,
    severity:
      | "escalated"
      | "urgent"
  ) {
    try {
      const settings =
        await prisma.systemSettings.findFirst();

      const adminPhones =
        settings?.adminAlertPhones ||
        [];

      const severityText =
        severity === "urgent"
          ? "🚨 URGENT"
          : "⚠️ Alert";

      const actionText =
        severity === "urgent"
          ? "IMMEDIATE ACTION REQUIRED - Call merchant or reassign"
          : "Action required - Call merchant";

      for (const phone of adminPhones) {
        await SMSService.sendRealSMS(
          phone,

          `${severityText} Order #${order.orderId.slice(
            -8
          )} needs attention! Merchant: ${
            order.merchant
              ?.businessName
          }. Amount: TSh ${Number(
            order.finalAmount ||
              order.amount
          ).toLocaleString()}. ${actionText}`
        );
      }
    } catch (error) {
      console.error(
        "Failed to notify admin via SMS:",
        error
      );
    }
  }
}

export default PriorityOrderService;