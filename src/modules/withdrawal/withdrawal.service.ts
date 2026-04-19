import { prisma } from "../../config/db";
import { SMSService } from '../../services/sms.service';

export class WithdrawalService {
  static async request(driverId: string, amount: number) {
    const wallet = await prisma.wallet.findUnique({
      where: { driverId },
    });

    if (!wallet || wallet.balance < amount) {
      throw new Error("Insufficient balance");
    }

    // Deduct balance
    await prisma.wallet.update({
      where: { driverId },
      data: {
        balance: wallet.balance - amount,
      },
    });

    const withdrawal = await prisma.withdrawal.create({
      data: {
        driverId,
        amount,
        status: "pending",
      },
    });

 // ✅ SMS: Notify driver about withdrawal request
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true }
    });
    
    if (driver?.user?.phone) {
      await SMSService.send(driver.user.phone, `💰 Withdrawal request of TZS ${amount} submitted. We'll process within 24 hours.`);
    }

    return withdrawal;
  }

  static async getAll() {
    return prisma.withdrawal.findMany();
  }

// ✅ NEW METHOD: Process withdrawal (admin)
  static async processWithdrawal(withdrawalId: string, status: 'approved' | 'rejected') {
    const withdrawal = await prisma.withdrawal.findUnique({
      where: { id: withdrawalId },
      include: { driver: { include: { user: true } } }
    });

    if (!withdrawal) throw new Error("Withdrawal not found");

    const updated = await prisma.withdrawal.update({
      where: { id: withdrawalId },
      data: { status }
    });

    // ✅ SMS: Notify driver about withdrawal status
    if (withdrawal.driver?.user?.phone) {
      const message = status === 'approved' 
        ? `✅ Your withdrawal of TZS ${withdrawal.amount} has been approved and sent to your mobile money.`
        : `❌ Your withdrawal of TZS ${withdrawal.amount} was rejected. Please contact support.`;
      
      await SMSService.send(withdrawal.driver.user.phone, message);
    }

    return updated;
  }
}