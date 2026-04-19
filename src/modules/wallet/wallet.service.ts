import { prisma } from "../../config/db";
import { SMSService } from '../../services/sms.service';

export class WalletService {
  static async getWallet(userId: string) {
  const driver = await prisma.driver.findUnique({
    where: { userId }
  });
    if (!driver) {
    throw new Error("Driver profile not found");
  }
    let wallet = await prisma.wallet.findUnique({
      where: { driverId: driver.id },
    });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: { driverId: driver.id, balance: 0 },
      });
    }

   return wallet;
  }

  static async credit(driverId: string, amount: number) {
      const wallet = await prisma.wallet.update({
      where: { driverId },
      data: {
        balance: { increment: amount },
      },
    });

 // ✅ SMS: Notify driver about credit
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { user: true }
    });
    
    if (driver?.user?.phone) {
      await SMSService.sendDriverEarnings(driver.user.phone, amount, "wallet_credit");
    }

    return wallet;

  }
}


{/*
//instead of const we use above return prisma
    const updated = await prisma.wallet.update({
      where: { driverId },
      data: {
        balance: wallet.balance + amount,
      },
    }); 

    await prisma.transaction.create({
      data: {
        walletId: updated.id,
        amount,
        type: "credit",
      },
    });

    return updated;
  } 

  static async get(driverId: string) {
    return prisma.wallet.findUnique({
      where: { driverId },
      include: { },
    });
  }
} 

*/}