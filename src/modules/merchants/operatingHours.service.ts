// src/modules/merchants/operatingHours.service.ts
import { prisma } from '../../config/db';

export interface OperatingHoursInput {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed?: boolean;
  isSpecial?: boolean;
}

export class OperatingHoursService {
  
  // Get operating hours for merchant
  static async getHours(merchantId: string) {
    const hours = await prisma.operatingHours.findMany({
      where: { merchantId },
      orderBy: { dayOfWeek: 'asc' }
    });
    
    // Return default hours if none exist
    if (hours.length === 0) {
      return this.getDefaultHours();
    }
    
    return hours;
  }
  
  // Get default operating hours (all days 9 AM - 10 PM)
  static getDefaultHours() {
    const defaultHours = [];
    for (let day = 0; day <= 6; day++) {
      defaultHours.push({
        dayOfWeek: day,
        opensAt: '09:00',
        closesAt: '22:00',
        isClosed: false,
        isSpecial: false
      });
    }
    return defaultHours;
  }
  
  // Update operating hours for merchant
  static async updateHours(merchantId: string, hours: OperatingHoursInput[]) {
    // Delete existing hours
    await prisma.operatingHours.deleteMany({
      where: { merchantId }
    });
    
    // Create new hours
    const created = await prisma.$transaction(
      hours.map(hour => 
        prisma.operatingHours.create({
          data: {
            merchantId,
            dayOfWeek: hour.dayOfWeek,
            opensAt: hour.opensAt,
            closesAt: hour.closesAt,
            isClosed: hour.isClosed || false,
            isSpecial: hour.isSpecial || false
          }
        })
      )
    );
    
    return created;
  }
  
  // Check if merchant is open now
  static async isOpenNow(merchantId: string): Promise<boolean> {
    const hours = await this.getHours(merchantId);
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    const todayHours = hours.find(h => h.dayOfWeek === currentDay);
    
    if (!todayHours || todayHours.isClosed) return false;
    
    const [openHour, openMinute] = todayHours.opensAt.split(':').map(Number);
    const [closeHour, closeMinute] = todayHours.closesAt.split(':').map(Number);
    
    const openTime = openHour * 60 + openMinute;
    const closeTime = closeHour * 60 + closeMinute;
    
    return currentTime >= openTime && currentTime <= closeTime;
  }
  
  // Get next opening time
  static async getNextOpenTime(merchantId: string): Promise<Date | null> {
    const hours = await this.getHours(merchantId);
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    
    // Check remaining days this week
    for (let offset = 0; offset <= 7; offset++) {
      const checkDay = (currentDay + offset) % 7;
      const dayHours = hours.find(h => h.dayOfWeek === checkDay);
      
      if (dayHours && !dayHours.isClosed) {
        const [openHour, openMinute] = dayHours.opensAt.split(':').map(Number);
        const openTime = openHour * 60 + openMinute;
        
        // If it's today and open time is later, return today
        if (offset === 0 && openTime > currentTime) {
          const result = new Date(now);
          result.setHours(openHour, openMinute, 0, 0);
          return result;
        }
        
        // Otherwise return next day's open time
        if (offset > 0) {
          const result = new Date(now);
          result.setDate(result.getDate() + offset);
          result.setHours(openHour, openMinute, 0, 0);
          return result;
        }
      }
    }
    
    return null;
  }
}