// src/modules/withdrawal/withdrawal.service.ts

import { prisma } from "../../config/db";
import { SMSService } from "../../services/sms.service";
import { createAuditLog } from "../admin/audit.service";
import { Decimal } from "@prisma/client/runtime/library";
import crypto from "crypto";

export const toNumber = (val: any): number => {
  if (!val) return 0;

  if (val instanceof Decimal) {
    return val.toNumber();
  }

  return Number(val);
};

export class WithdrawalService {

  // ============================================================
  // REQUEST WITHDRAWAL
  // ============================================================

  static async request(
    driverId: string,
    amount: number
  ) {
    const driver =
      await prisma.driver.findUnique({
        where: {
          id: driverId
        },

        include: {
          user: true,
          wallet: true
        }
      });

    if (!driver) {
      throw new Error(
        "Driver not found"
      );
    }

    if (!driver.wallet) {
      throw new Error(
        "Wallet not found"
      );
    }

    // ==========================================================
    // VALIDATE AMOUNT
    // ==========================================================

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      throw new Error(
        "Invalid withdrawal amount"
      );
    }

    // ==========================================================
    // MINIMUM WITHDRAWAL
    // ==========================================================

    const MIN_WITHDRAWAL = 1000;

    if (amount < MIN_WITHDRAWAL) {
      throw new Error(
        `Minimum withdrawal is ${MIN_WITHDRAWAL}`
      );
    }

    // ==========================================================
    // CHECK BALANCE
    // ==========================================================

    const walletBalance =
      new Decimal(
        driver.wallet.balance
      );

    if (
      walletBalance.lessThan(amount)
    ) {
      throw new Error(
        "Insufficient balance"
      );
    }

    // ==========================================================
    // PREVENT DUPLICATE PENDING WITHDRAWALS
    // ==========================================================

    const existingPending =
      await prisma.withdrawal.findFirst({
        where: {
          driverId,
          status: "pending"
        }
      });

    if (existingPending) {
      throw new Error(
        "You already have a pending withdrawal request"
      );
    }

    // ==========================================================
    // CREATE WITHDRAWAL + RESERVE FUNDS
    // ==========================================================

    const withdrawal =
      await prisma.$transaction(
        async (tx) => {

          // Reserve the withdrawal amount
          // from the driver's wallet.
          await tx.wallet.update({
            where: {
              id: driver.wallet!.id
            },

            data: {
              balance: {
                decrement: amount
              }
            }
          });

          // Prisma requires requestId.
          // Generate a unique request identifier
          // for this withdrawal request.
          const requestId =
            crypto.randomUUID();

          return tx.withdrawal.create({
            data: {
              requestId,

              driver: {
                connect: {
                  id: driverId
                }
              },

              amount,

              status: "pending"
            }
          });
        }
      );

    // ==========================================================
    // SMS NOTIFICATION
    // ==========================================================

    if (driver.user?.phone) {
      await SMSService.sendRealSMS(
        driver.user.phone,
        `💰 Withdrawal request of TZS ${amount} submitted.`
      );
    }

    return withdrawal;
  }

  // ============================================================
  // GET ALL WITHDRAWALS
  // ============================================================

  static async getAll() {
    return prisma.withdrawal.findMany({
      include: {
        driver: {
          include: {
            user: true
          }
        }
      }
    });
  }

  // ============================================================
  // PROCESS WITHDRAWAL
  // ============================================================

  static async processWithdrawal(
    withdrawalId: string,
    status:
      | "approved"
      | "rejected",
    adminId: string
  ) {
    const withdrawal =
      await prisma.withdrawal.findUnique({
        where: {
          id: withdrawalId
        },

        include: {
          driver: {
            include: {
              user: true,
              wallet: true
            }
          }
        }
      });

    if (!withdrawal) {
      throw new Error(
        "Withdrawal not found"
      );
    }

    if (!withdrawal.driver.wallet) {
      throw new Error(
        "Driver wallet not found"
      );
    }

    // ==========================================================
    // PROCESS WITHDRAWAL
    // ==========================================================

    const updated =
      await prisma.$transaction(
        async (tx) => {

          // ====================================================
          // REJECTED
          // ====================================================
          // The amount was already deducted when the
          // withdrawal was requested, so return it to the
          // driver's wallet when the request is rejected.

          if (status === "rejected") {
            await tx.wallet.update({
              where: {
                id:
                  withdrawal.driver.wallet!.id
              },

              data: {
                balance: {
                  increment:
                    withdrawal.amount
                }
              }
            });
          }

          // ====================================================
          // UPDATE WITHDRAWAL STATUS
          // ====================================================

          return tx.withdrawal.update({
            where: {
              id: withdrawalId
            },

            data: {
              status
            }
          });
        }
      );

    // ==========================================================
    // AUDIT LOG
    // ==========================================================

    await createAuditLog({
      adminId,

      action:
        status === "approved"
          ? "APPROVE_WITHDRAWAL"
          : "REJECT_WITHDRAWAL",

      targetType:
        "withdrawal",

      targetId:
        withdrawal.id,

      meta: {
        amount:
          withdrawal.amount
      }
    });

    // ==========================================================
    // SMS NOTIFICATION
    // ==========================================================

    if (
      withdrawal.driver?.user?.phone
    ) {
      await SMSService.sendRealSMS(
        withdrawal.driver.user.phone,

        status === "approved"
          ? `✅ Withdrawal approved`
          : `❌ Withdrawal rejected`
      );
    }

    return updated;
  }
}