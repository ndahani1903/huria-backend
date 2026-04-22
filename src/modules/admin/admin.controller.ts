import { Request, Response } from "express";
import { AdminService } from "./admin.service";
import { prisma } from "../../config/db";

export class AdminController {
   // Get platform stats
  static async stats(req: Request, res: Response) {
    try {
      const data = await AdminService.getStats();
      res.json(data);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  static async users(req: Request, res: Response) {
    const data = await AdminService.getUsers();
    res.json(data);
  }

  // 📦 ALL ORDERS
  static async getOrders(req: Request, res: Response) {
    const orders = await prisma.order.findMany({
      include: {
        items: {
          include: { product: true }
        },
        user: {
          select: { name: true, email: true, phone: true }
        },
        driver: {
          include: { user: { select: { name: true, phone: true } } }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    res.json(orders);
  }

  // 🚚 ALL DRIVERS
  static async getDrivers(req: Request, res: Response) {
     try {
      const drivers = await prisma.driver.findMany({
        include: {
          user: {
            select: { name: true, email: true, phone: true }
          },
          wallet: true
        }
      });
      res.json(drivers);
    } catch (error: any) {
      console.error("Get drivers error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  // 🏪 ALL MERCHANTS
  static async getMerchants(req: Request, res: Response) {
    try {
      const merchants = await prisma.merchant.findMany({
        include: {
          user: {
            select: { name: true, email: true, phone: true }
          },
          products: true
        }
      });
      res.json(merchants);
    } catch (error: any) {
      console.error("Get merchants error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  // ⚠️ GET DISPUTES
  static async getDisputes(req: Request, res: Response) {
     try {
      const disputes = await prisma.dispute.findMany({
        include: {
          order: {
            include: {
              user: {
                select: { name: true, email: true, phone: true }
              },
              driver: {
                include: {
                  user: { select: { name: true } }
                }
              }
            }
          },
          resolvedBy: {
            select: { name: true, email: true }
          }
        },
        orderBy: { createdAt: "desc" }
      });
      res.json(disputes);
    } catch (error: any) {
      // If Dispute model doesn't exist, return empty array
      console.error("Disputes error:", error.message);
      res.json([]);
    } 
  }

  // 🔄 UPDATE DISPUTE
  static async updateDispute(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status, resolution } = req.body;
      
      const dispute = await prisma.dispute.update({
        where: { id: id as string},
        data: {
          status,
          resolution,
          resolvedAt: new Date(),
          resolvedById: (req as any).user?.id
        }
      });
      
      res.json(dispute);
    } catch (error: any) {
      console.error("Update dispute error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  // 💰 GET WITHDRAWALS
  static async getWithdrawals(req: Request, res: Response) {
    try {
      const withdrawals = await prisma.withdrawal.findMany({
        include: {
          driver: {
            include: {
              user: { select: { name: true, email: true, phone: true } }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      });
      res.json(withdrawals);
    } catch (error: any) {
      console.error("Withdrawals error:", error.message);
      res.json([]);
    }
  }

  // 🔄 UPDATE WITHDRAWAL
  static async updateWithdrawal(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.body;
      
      const withdrawal = await prisma.withdrawal.update({
        where: { id: id as string},
        data: { status }
      });
      
      res.json(withdrawal);
    } catch (error: any) {
      console.error("Update withdrawal error:", error);
      res.status(500).json({ error: error.message });
    }
  }

 static async getAnalytics(req: Request, res: Response) {
  const orders = await prisma.order.findMany({
    where: { status: "completed" },
  });

  const totalRevenue = orders.reduce((sum, o) => sum + o.amount, 0);
  const totalDeliveryFees = orders.reduce(
    (sum, o) => sum + (o.deliveryFee || 0),
    0
  );

  const platformProfit = orders.reduce(
    (sum, o) => sum + (o.platformFee || 0),
    0
  );

  const driverPayout = orders.reduce(
    (sum, o) => sum + (o.driverEarning || 0),
    0
  );

  res.json({
    totalOrders: orders.length,
    totalRevenue,
    totalDeliveryFees,
    platformProfit,
    driverPayout,
  });
}

  static async topDrivers(req: Request, res: Response) {
     const drivers = await prisma.order.groupBy({
        by: ["driverId"],
        _sum: {
          driverEarning: true,
        },
       where: {
         status: "completed",
         driverId: { not: null },
        },
       orderBy: {
         _sum: {
         driverEarning: "desc",
       },
     },
     take: 5,
   });

   // Get driver details
    const driverDetails = await Promise.all(
      drivers.map(async (d) => {
        const driver = await prisma.driver.findUnique({
          where: { id: d.driverId! },
          include: { user: { select: { name: true, phone: true } } }
        });
        return {
          driverId: d.driverId,
          name: driver?.user?.name || "Unknown",
          phone: driver?.user?.phone,
          totalEarnings: d._sum.driverEarning || 0
        };
      })
    );

 res.json(driverDetails);
}

}