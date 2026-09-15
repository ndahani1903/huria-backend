// src/modules/wallet/wallet.service.ts
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
      where: { driverId: driver.id }
    });

    if (!wallet) {
      wallet = await prisma.wallet.create({
        data: {
          driverId: driver.id,
          balance: 0,
          pendingBalance: 0,
        }
      });
    }

    return wallet;
  }

  // release payment to driver
  static async credit(driverId: string, amount: number) {
    // First check if wallet exists
    let wallet = await prisma.wallet.findUnique({
      where: { driverId: driverId }
    });

    // Create wallet if it doesn't exist
    if (!wallet) {
      console.log(`💰 Creating new wallet for driver ${driverId}`);
      wallet = await prisma.wallet.create({
        data: {
          driverId: driverId,
          balance: 0,
          pendingBalance: 0,
        }
      });
    }

    // Now update the wallet
    const updatedWallet = await prisma.wallet.update({
      where: { driverId: driverId },
      data: {
        balance: { increment: amount },
      },
    });

    // Get driver info for SMS
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