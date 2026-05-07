import { prisma } from "../../config/db";
import redis from "../../config/redis";
import { Decimal } from "@prisma/client/runtime/library";


interface DriverStats {
  deliveriesToday: number;
  deliveriesThisWeek: number;
  deliveriesThisMonth: number;
  rating: number;
  streak: number;
  earnings: number;
}

interface Achievement {
  points: number;
  badge: string;
}

export const toNumber = (val: any): number => {
  if (!val) return 0;
  if (val instanceof Decimal) return val.toNumber();
  return Number(val);
};

export const ACHIEVEMENTS: Record<string, Achievement> = {
  first_delivery: { points: 100, badge: '🏆 First Step' },
  ten_deliveries: { points: 500, badge: '⭐ Rising Star' },
  hundred_deliveries: { points: 2000, badge: '💪 Veteran' },
  perfect_week: { points: 1000, badge: '✨ Perfect Week' },
  early_bird: { points: 200, badge: '🌅 Early Bird' },
  night_owl: { points: 300, badge: '🦉 Night Owl' },
  rain_rider: { points: 500, badge: '🌧️ Rain Rider' }
};

export class DriverGamificationService {
  private readonly STREAK_BONUSES: Record<string, number> = {
    '7': 50000,   // TSh 50,000 for 7-day streak
    '30': 250000, // TSh 250,000 for 30-day streak
    '90': 1000000 // TSh 1,000,000 for 90-day streak
  };
  
  private readonly RATING_BONUSES: Record<string, number> = {
    '4.9': 100000,
    '4.8': 50000,
    '4.7': 25000
  };

  async updateDriverStats(driverId: string, deliveryId: string): Promise<void> {
    const stats = await this.getDriverStats(driverId);
    const achievements = await this.checkAchievements(driverId, stats);
    
    // Update streak
    const streak = await this.updateStreak(driverId);
    
    // Apply bonuses
    await this.applyBonuses(driverId, stats, streak);
    
    // Award achievements
    for (const achievement of achievements) {
      await this.awardAchievement(driverId, achievement);
    }
    
    // Update leaderboard
    await this.updateLeaderboard(driverId, stats);
  }

  async getLeaderboard(period: 'daily' | 'weekly' | 'monthly'): Promise<any[]> {
    const key = `leaderboard:${period}`;
    const leaders = await redis.zrevrange(key, 0, 99, 'WITHSCORES');
    
    const result = [];
    for (let i = 0; i < leaders.length; i += 2) {
      result.push({
        driverId: leaders[i],
        score: parseInt(leaders[i + 1]),
        rank: i / 2 + 1
      });
    }
    
    return result;
  }

  async getDriverRank(driverId: string): Promise<any> {
    const [daily, weekly, monthly] = await Promise.all([
      redis.zrevrank('leaderboard:daily', driverId),
      redis.zrevrank('leaderboard:weekly', driverId),
      redis.zrevrank('leaderboard:monthly', driverId)
    ]);
    
    return {
      daily: daily !== null ? daily + 1 : null,
      weekly: weekly !== null ? weekly + 1 : null,
      monthly: monthly !== null ? monthly + 1 : null
    };
  }

  async getDriverAchievementsList(driverId: string): Promise<any[]> {
  const achievements = await prisma.driverAchievement.findMany({
    where: { driverId },
    orderBy: { awardedAt: 'desc' }
  });
  
  // Add achievement details
  return achievements.map(ach => ({
    ...ach,
    details: ACHIEVEMENTS[ach.achievementId] || { badge: ach.achievementId, points: ach.points }
  }));
}

  private async updateStreak(driverId: string): Promise<number> {
    const lastDelivery = await prisma.order.findFirst({
      where: { driverId, status: 'completed' },
      orderBy: { completedAt: 'desc' }
    });
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    let streak = 1;
    
    // Check if driver delivered yesterday
    if (lastDelivery && lastDelivery.completedAt) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      
      if (lastDelivery.completedAt >= yesterday) {
        const streakKey = `streak:${driverId}`;
        const savedStreak = await redis.get(streakKey);
        streak = savedStreak ? parseInt(savedStreak) + 1 : 2;
      }
    }
    
    await redis.setex(`streak:${driverId}`, 86400 * 30, streak.toString());
    return streak;
  }

  private async applyBonuses(driverId: string, stats: DriverStats, streak: number): Promise<void> {
    // Streak bonuses
    for (const [days, bonus] of Object.entries(this.STREAK_BONUSES)) {
      if (streak >= parseInt(days)) {
        await this.addBonus(driverId, bonus, `Streak bonus: ${days} days`);
      }
    }
    
    // Rating bonuses
    for (const [rating, bonus] of Object.entries(this.RATING_BONUSES)) {
      if (stats.rating >= parseFloat(rating)) {
        await this.addBonus(driverId, bonus, `Rating bonus: ${rating}⭐`);
      }
    }
    
    // Performance milestones
    if (stats.deliveriesThisMonth === 10) {
      await this.addBonus(driverId, 5000, 'Milestone: 10 deliveries this month');
    }
    if (stats.deliveriesThisMonth === 50) {
      await this.addBonus(driverId, 25000, 'Milestone: 50 deliveries this month');
    }
    if (stats.deliveriesThisMonth === 100) {
      await this.addBonus(driverId, 50000, 'Milestone: 100 deliveries this month');
    }
  }

  public async addBonus(driverId: string, amount: number, reason: string): Promise<void> {
    // Find driver's wallet
    const driver = await prisma.driver.findUnique({
      where: { id: driverId },
      include: { wallet: true }
    });
    
    if (!driver?.wallet) {
      console.log(`No wallet found for driver ${driverId}`);
      return;
    }
    
    await prisma.$transaction(async (tx) => {
      await tx.wallet.update({
        where: { id: driver.wallet!.id },
        data: { balance: { increment: amount } }
      });
      
      // Get current balance first
const currentWallet = await tx.wallet.findUnique({
  where: { id: driver.wallet!.id }
});
const newBalance = toNumber(currentWallet?.balance || 0) + amount;


      await tx.transaction.create({
        data: {
          walletId: driver.wallet!.id,
          amount,
          type: 'credit',
          balanceAfter: newBalance,
          status: 'completed',
          createdAt: new Date()
        }
      });
    });
  }

  private async checkAchievements(driverId: string, stats: DriverStats): Promise<string[]> {
    const earned: string[] = [];
    const existingAchievements = await this.getDriverAchievements(driverId);
    
    if (!existingAchievements.includes('first_delivery') && stats.deliveriesToday >= 1) {
      earned.push('first_delivery');
    }
    
    if (!existingAchievements.includes('ten_deliveries') && stats.deliveriesThisMonth >= 10) {
      earned.push('ten_deliveries');
    }
    
    if (!existingAchievements.includes('hundred_deliveries') && stats.deliveriesThisMonth >= 100) {
      earned.push('hundred_deliveries');
    }
    
    if (!existingAchievements.includes('perfect_week') && stats.deliveriesThisWeek >= 7) {
      earned.push('perfect_week');
    }
    
    const hour = new Date().getHours();
    if (!existingAchievements.includes('early_bird') && (hour >= 5 && hour <= 7)) {
      earned.push('early_bird');
    }
    
    if (!existingAchievements.includes('night_owl') && (hour >= 22 || hour <= 4)) {
      earned.push('night_owl');
    }
    
    return earned;
  }

  private async awardAchievement(driverId: string, achievementId: string): Promise<void> {
    const achievement = ACHIEVEMENTS[achievementId];
    if (!achievement) return;
    
    await prisma.driverAchievement.create({
      data: {
        driverId,
        achievementId,
        points: achievement.points,
        awardedAt: new Date()
      }
    });
    
    // Add points as bonus to wallet
    await this.addBonus(driverId, achievement.points, `Achievement: ${achievement.badge}`);
    
    // Send notification (if notification model exists)
    try {
      await prisma.notification.create({
        data: {
          userId: driverId,
          type: 'achievement',
          title: `🏆 Achievement Unlocked!`,
          message: `You earned "${achievement.badge}" and ${achievement.points} points!`,
          data: { achievementId, badge: achievement.badge, points: achievement.points },
          createdAt: new Date()
        }
      });
    } catch (error) {
      console.log(`Notification for driver ${driverId} skipped`);
    }
  }

  private async updateLeaderboard(driverId: string, stats: DriverStats): Promise<void> {
    // Calculate score: deliveries * 10 + rating * 20
    const score = (stats.deliveriesToday * 10) + (stats.rating * 20);
    
    await Promise.all([
      redis.zadd('leaderboard:daily', score, driverId),
      redis.zadd('leaderboard:weekly', score, driverId),
      redis.zadd('leaderboard:monthly', score, driverId)
    ]);
    
    // Set expiry for leaderboards
    await redis.expire('leaderboard:daily', 86400);      // 24 hours
    await redis.expire('leaderboard:weekly', 604800);    // 7 days
    await redis.expire('leaderboard:monthly', 2592000);  // 30 days
  }

  public async getDriverStats(driverId: string): Promise<DriverStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const weekAgo = new Date(Date.now() - 7 * 86400000);
    const monthAgo = new Date(Date.now() - 30 * 86400000);
    
    const [deliveriesToday, deliveriesWeek, deliveriesMonth, driver, earnings] = await Promise.all([
      prisma.order.count({ where: { driverId, status: 'completed', completedAt: { gte: today } } }),
      prisma.order.count({ where: { driverId, status: 'completed', completedAt: { gte: weekAgo } } }),
      prisma.order.count({ where: { driverId, status: 'completed', completedAt: { gte: monthAgo } } }),
      prisma.driver.findUnique({ where: { id: driverId }, select: { rating: true } }),
      prisma.order.aggregate({ 
        where: { driverId, status: 'completed', completedAt: { gte: monthAgo } }, 
        _sum: { driverEarning: true } 
      })
    ]);
    
    const streak = await redis.get(`streak:${driverId}`);
    
    return {
      deliveriesToday,
      deliveriesThisWeek: deliveriesWeek,
      deliveriesThisMonth: deliveriesMonth,
      rating: driver?.rating || 5.0,
      streak: streak ? parseInt(streak) : 0,
      earnings: toNumber(earnings._sum.driverEarning || 0)
    };
  }

  private async getDriverAchievements(driverId: string): Promise<string[]> {
    const achievements = await prisma.driverAchievement.findMany({
      where: { driverId },
      select: { achievementId: true }
    });
    return achievements.map(a => a.achievementId);
  }
}

export default new DriverGamificationService();