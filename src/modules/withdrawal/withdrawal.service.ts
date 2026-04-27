import { prisma } from "../../config/db";
import { SMSService } from "../../services/sms.service";
import { createAuditLog } from "../admin/audit.service";

export class WithdrawalService {
  static async request(driverId: string, amount: number) {
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true, wallet: true }
    });

    if (!driver) throw new Error("Driver not found");
    if (!driver.wallet) throw new Error("Wallet not found");

    if (driver.wallet.balance < amount) {
      throw new Error("Insufficient balance");
    }

    const withdrawal = await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: driver.wallet!.id },
        data: {
          balance: driver.wallet!.balance - amount
        }
      });

      return tx.withdrawal.create({
        data: {
          driverId,
          amount,
          status: "pending"
        }
      });
    });

    if (driver.user?.phone) {
      await SMSService.send(
        driver.user.phone,
        `💰 Withdrawal request of TZS ${amount} submitted.`
      );
    }

    return withdrawal;
  }

  static async getAll() {
    return prisma.withdrawal.findMany({
      include: {
        driver: { include: { user: true } }
      }
    });
  }

  static async processWithdrawal(
    withdrawalId: string,
    status: "approved" | "rejected",
    adminId: string
  ) {
    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
      include: {
        driver: { include: { user: true, wallet: true } }
      }
    });

    if (!withdrawal) throw new Error("Withdrawal not found");

   const updated = await prisma.$transaction(async (tx) => {
    // If rejected, refund wallet
    if (status === "rejected") {
      await tx.wallet.update({
        where: { id: withdrawal.driver.wallet.id },
        data: {
          balance: {
            increment: withdrawal.amount
          }
        }
      });
    }

    return tx.withdrawal.update({
      where: { id: withdrawalId },
      data: { status }
    });
  });

    await createAuditLog({
      adminId,
      action:
        status === "approved"
          ? "APPROVE_WITHDRAWAL"
          : "REJECT_WITHDRAWAL",
      targetType: "withdrawal",
      targetId: withdrawal.id,
      meta: { amount: withdrawal.amount }
    });

    if (withdrawal.driver?.user?.phone) {
      await SMSService.send(
        withdrawal.driver.user.phone,
        status === "approved"
          ? `✅ Withdrawal approved`
          : `❌ Withdrawal rejected`
      );
    }

    return updated;
  }
}