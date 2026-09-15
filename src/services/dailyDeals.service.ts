// src/services/dailyDeals.service.ts
import { prisma } from "../config/db";
import { Decimal } from "@prisma/client/runtime/library";

const toNumber = (val: any) => val instanceof Decimal ? val.toNumber() : Number(val);

interface DealConfig {
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  name: string;
  discountPercentage: number;
  productLimit: number;
  categoryFilters?: string[];
  merchantTypes?: string[];
  priceRange?: { min: number; max: number };
  gender?: string;
  tags?: string[];
}

const DAILY_DEAL_CONFIGS: DealConfig[] = [
  {
    dayOfWeek: 1, // Monday
    name: "Monday Motivation",
    discountPercentage: 15,
    productLimit: 35,
    priceRange: { min: 0, max: 300000 },
  },
  {
    dayOfWeek: 2, // Tuesday
    name: "Restaurant & Grocery Tuesday",
    discountPercentage: 10,
    productLimit: 15,
    merchantTypes: ["RESTAURANT", "SUPERMARKET"],
  },
  {
    dayOfWeek: 3, // Wednesday
    name: "Women's Day Special",
    discountPercentage: 8,
    productLimit: 30,
    gender: "women",
  },
  {
    dayOfWeek: 5, // Friday
    name: "Friday Flash Deals",
    discountPercentage: 12,
    productLimit: 35,
  },
];

export class DailyDealsService {
  
  // Get deals for today based on day of week
  static async getTodayDeals() {
    const today = new Date().getDay(); // 0-6, Sunday = 0
    const isFirstDayOfMonth = new Date().getDate() === 1;
    const isLastSundayOfMonth = this.isLastSundayOfMonth();
    
    // Special: First day of month
    if (isFirstDayOfMonth) {
      return this.getFirstDayOfMonthDeals();
    }
    
    // Special: Last Sunday of month
    if (isLastSundayOfMonth && today === 0) {
      return this.getLastSundayDeals();
    }
    
    // Regular daily deals
    const config = DAILY_DEAL_CONFIGS.find(c => c.dayOfWeek === today);
    if (!config) {
      // Fallback: return random 20 products with 5% discount
      return this.getRandomDeals(20, 5);
    }
    
    return this.getDealsByConfig(config);
  }
  
  // Get deals for any specific date (for calendar view)
  static async getDealsForDate(date: Date) {
    const dayOfWeek = date.getDay();
    const isFirstDayOfMonth = date.getDate() === 1;
    const isLastSundayOfMonth = this.isLastSundayOfMonth(date);
    
    if (isFirstDayOfMonth) {
      return this.getFirstDayOfMonthDeals(date);
    }
    
    if (isLastSundayOfMonth && dayOfWeek === 0) {
      return this.getLastSundayDeals(date);
    }
    
    const config = DAILY_DEAL_CONFIGS.find(c => c.dayOfWeek === dayOfWeek);
    if (!config) {
      return this.getRandomDeals(20, 5, date);
    }
    
    return this.getDealsByConfig(config, date);
  }
  
  // Get deals by configuration
  private static async getDealsByConfig(config: DealConfig, referenceDate: Date = new Date()) {
    const { discountPercentage, productLimit, categoryFilters, merchantTypes, priceRange, gender } = config;
    
    // Build query filters
    const where: any = {
      isActive: true,
      merchant: { isActive: true },
    };
    
    // Apply merchant type filter
    if (merchantTypes && merchantTypes.length > 0) {
      where.merchant = {
        ...where.merchant,
        merchantType: { in: merchantTypes }
      };
    }
    
    // Apply category filter
    if (categoryFilters && categoryFilters.length > 0) {
      where.category = { in: categoryFilters };
    }
    
    // Apply price range
    if (priceRange) {
      where.price = {
        gte: priceRange.min,
        lte: priceRange.max
      };
    }
    
    // Apply gender filter
    if (gender) {
      where.gender = gender;
    }
    
    // Get random products matching criteria
    const products = await prisma.product.findMany({
      where,
      include: {
        merchant: {
          select: { businessName: true, name: true, rating: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: productLimit * 2 // Get extra for randomness
    });
    
    // Randomize and limit
    const shuffled = this.shuffleArray(products);
    const selectedProducts = shuffled.slice(0, productLimit);
    
    // Apply discount to each product
    return selectedProducts.map(product => ({
      ...product,
      originalPrice: toNumber(product.price),
      discountedPrice: toNumber(product.price) * (1 - discountPercentage / 100),
      discountPercentage,
      discountType: 'daily_deal',
      dealName: config.name,
      price: toNumber(product.price) * (1 - discountPercentage / 100) // For frontend display
    }));
  }
  
  // First day of month deals (5% off, trending products)
  private static async getFirstDayOfMonthDeals(referenceDate: Date = new Date()) {
    const discountPercentage = 5;
    const productLimit = 20;
    
    // Get trending products (high view count and purchase count)
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        OR: [
          { popularSearchCount: { gt: 0 } },
          { viewCount: { gt: 10 } },
          { purchaseCount: { gt: 0 } }
        ]
      },
      include: {
        merchant: {
          select: { businessName: true, name: true, rating: true }
        }
      },
      orderBy: [
        { purchaseCount: 'desc' },
        { viewCount: 'desc' },
        { popularSearchCount: 'desc' }
      ],
      take: productLimit * 2
    });
    
    const shuffled = this.shuffleArray(products);
    const selectedProducts = shuffled.slice(0, productLimit);
    
    return selectedProducts.map(product => ({
      ...product,
      originalPrice: toNumber(product.price),
      discountedPrice: toNumber(product.price) * (1 - discountPercentage / 100),
      discountPercentage,
      discountType: 'first_day_month',
      dealName: "New Month Special! 🎉",
      price: toNumber(product.price) * (1 - discountPercentage / 100)
    }));
  }
  
  // Last Sunday of month deals (10% off, 15 products)
  private static async getLastSundayDeals(referenceDate: Date = new Date()) {
    const discountPercentage = 10;
    const productLimit = 15;
    
    // Get high-rated products
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        rating: { gte: 4 }
      },
      include: {
        merchant: {
          select: { businessName: true, name: true, rating: true }
        }
      },
      orderBy: { rating: 'desc' },
      take: productLimit * 2
    });
    
    const shuffled = this.shuffleArray(products);
    const selectedProducts = shuffled.slice(0, productLimit);
    
    return selectedProducts.map(product => ({
      ...product,
      originalPrice: toNumber(product.price),
      discountedPrice: toNumber(product.price) * (1 - discountPercentage / 100),
      discountPercentage,
      discountType: 'last_sunday',
      dealName: "Sunday Funday Special! 🎈",
      price: toNumber(product.price) * (1 - discountPercentage / 100)
    }));
  }
  
  // Fallback random deals
  private static async getRandomDeals(limit: number, discountPercentage: number, referenceDate: Date = new Date()) {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: {
        merchant: {
          select: { businessName: true, name: true, rating: true }
        }
      },
      take: limit * 2
    });
    
    const shuffled = this.shuffleArray(products);
    const selectedProducts = shuffled.slice(0, limit);
    
    return selectedProducts.map(product => ({
      ...product,
      originalPrice: toNumber(product.price),
      discountedPrice: toNumber(product.price) * (1 - discountPercentage / 100),
      discountPercentage,
      discountType: 'daily_deal',
      dealName: "Limited Time Offer! 🔥",
      price: toNumber(product.price) * (1 - discountPercentage / 100)
    }));
  }
  
  // Helper: Check if date is last Sunday of month
  private static isLastSundayOfMonth(date: Date = new Date()): boolean {
    const lastDayOfMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    const lastSunday = new Date(lastDayOfMonth);
    lastSunday.setDate(lastDayOfMonth.getDate() - lastDayOfMonth.getDay());
    return date.toDateString() === lastSunday.toDateString();
  }
  
  // Helper: Shuffle array for randomness
  private static shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
  
  // Get all available deals for calendar view
  static async getAllMonthlyDeals(year: number, month: number) {
    const deals: any[] = [];
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);
    
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayDeals = await this.getDealsForDate(new Date(d));
      if (dayDeals && dayDeals.length > 0) {
        deals.push({
          date: new Date(d).toISOString().split('T')[0],
          dayOfWeek: d.getDay(),
          dealCount: dayDeals.length,
          deals: dayDeals
        });
      }
    }
    
    return deals;
  }
}