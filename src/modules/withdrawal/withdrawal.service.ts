import { prisma } from "../../config/db";
import { SMSService } from '../../services/sms.service';

export class WithdrawalService {
  static async request(driverId: string, amount: number) {
    // ✅ FIX: Get wallet with correct driverId relation
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { wallet: true }
    });

    if (!driver) {
      throw new Error("Driver not found");
    }

    const wallet = driver.wallet;

    if (!wallet) {
      throw new Error("Wallet not found");
    }

    console.log(`💰 Withdrawal check: Balance=${wallet.balance}, Requested=${amount}`);

    if (wallet.balance < amount) {
      throw new Error(`Insufficient balance. Available: ${wallet.balance} TZS`);
    }
    
     // Deduct balance
    await prisma.wallet.update({
      where: { id: wallet.id }, // ✅ Use wallet.id instead of driverId
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
    if (driver?.user?.phone) {
      await SMSService.send(driver.user.phone, `💰 Withdrawal request of TZS ${amount} submitted. We'll process within 24 hours.`);
    }

    return withdrawal;
  }

   static async getAll() {
    return prisma.withdrawal.findMany({
      include: {
        driver: {
          include: { user: true }
        }
      }
    });
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