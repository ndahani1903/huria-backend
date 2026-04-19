import { Request, Response } from "express";
import { AdminService } from "./admin.service";
import { prisma } from "../../config/db";

export class AdminController {
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
        items: true,
      },
      orderBy: { createdAt: "desc" }
    });

    res.json(orders);
  }

  // 🚚 ALL DRIVERS
  static async getDrivers(req: Request, res: Response) {
    const drivers = await prisma.driver.findMany();
    res.json(drivers);
  }

  // 🏪 ALL MERCHANTS
  static async getMerchants(req: Request, res: Response) {
    const merchants = await prisma.merchant.findMany({
      include: {
        products: true
      }
    });

    res.json(merchants);
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

  res.json(drivers);
}
}

