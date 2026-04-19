import { prisma } from '../config/db';

export class AnalyticsService {
  
  // Daily stats
  static async getDailyStats(date: Date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    
    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: start, lte: end } },
    });
    
    const completedOrders = orders.filter(o => o.status === 'completed');
    const totalRevenue = completedOrders.reduce((sum, o) => sum + o.amount, 0);
    
    return {
      date: start,
      totalOrders: orders.length,
      completedOrders: completedOrders.length,
      totalRevenue,
      averageOrderValue: completedOrders.length ? totalRevenue / completedOrders.length : 0,
    };
  }
  
  // Weekly report
  static async getWeeklyReport() {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d;
    });
    
    const dailyStats = await Promise.all(
      last7Days.map(d => this.getDailyStats(d))
    );
    
    return {
      period: 'last_7_days',
      daily: dailyStats.reverse(),
      total: dailyStats.reduce((sum, d) => sum + d.totalOrders, 0),
      revenue: dailyStats.reduce((sum, d) => sum + d.totalRevenue, 0),
    };
  }
  
  // Driver performance
  static async getDriverPerformance(driverId: string) {
    const orders = await prisma.order.findMany({
      where: { driverId, status: 'completed' },
    });
    
    const totalDeliveries = orders.length;
    const totalEarnings = orders.reduce((sum, o) => sum + (o.driverEarning || 0), 0);
    const avgDeliveryTime = orders.reduce((sum, o) => {
      const deliveryTime = o.updatedAt.getTime() - o.createdAt.getTime();
      return sum + deliveryTime;
    }, 0) / (totalDeliveries || 1);
    
    return {
      driverId,
      totalDeliveries,
      totalEarnings,
      averageDeliveryMinutes: Math.round(avgDeliveryTime / 60000),
      rating: 4.8, // Implement rating system
    };
  }
  
  // Top products
  static async getTopProducts(limit = 10) {
    const orderItems = await prisma.orderItem.groupBy({
      by: ['productId'],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });
    
    const products = await Promise.all(
      orderItems.map(async (item) => {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
        });
        return {
          productId: item.productId,
          name: product?.name,
          totalSold: item._sum.quantity,
        };
      })
    );
    
    return products;
  }
  
  // Customer lifetime value
  static async getCustomerLTV(customerId: string) {
    const orders = await prisma.order.findMany({
      where: { userId: customerId, status: 'completed' },
    });
    
    const totalSpent = orders.reduce((sum, o) => sum + o.amount, 0);
    const orderCount = orders.length;
    
    return {
      customerId,
      totalSpent,
      orderCount,
      averageOrderValue: orderCount ? totalSpent / orderCount : 0,
      lifetimeValue: totalSpent,
    };
  }
}