import { Redis } from 'ioredis';
import { prisma } from "../config/db";

const redis = new Redis();

interface PricingFactors {
  basePrice: number;
  distance: number; // km
  demandFactor: number;
  supplyFactor: number;
  weatherFactor: number;
  timeFactor: number;
  trafficFactor: number;
  vehicleType: string;
  urgency: 'normal' | 'express' | 'scheduled';
}

interface PricingBreakdown {
  distance: number;
  surgeMultiplier: number;
  weatherMultiplier: number;
  timeMultiplier: number;
  trafficMultiplier: number;
  expressMultiplier: number;
}

interface PricingResult {
  finalPrice: number;
  breakdown: PricingBreakdown;
  surgeMultiplier: number;
}

export class DynamicPricingService {
  private readonly BASE_RATES: Record<string, number> = {
    motorcycle: 2.50, // $ per km
    car: 3.50,
    truck: 5.00
  };

  async calculateDeliveryPrice(params: PricingFactors): Promise<PricingResult> 
  {
    // Get real-time factors
    const [demand, supply, weather, traffic] = await Promise.all([
      this.getCurrentDemand(params.distance),
      this.getAvailableDrivers(params.distance),
      this.getWeatherConditions(params.distance),
      this.getTrafficConditions(params.distance)
    ]);

    // Calculate surge multiplier
    const surgeMultiplier = this.calculateSurgeMultiplier(demand, supply);
    const weatherMultiplier = this.getWeatherMultiplier(weather);
    const timeMultiplier = this.getTimeMultiplier();
    const trafficMultiplier = this.getTrafficMultiplier(traffic);

    // Base price calculation
    const baseRate = this.BASE_RATES[params.vehicleType] || this.BASE_RATES.motorcycle;
    const distancePrice = baseRate * params.distance;
    
    // Apply multipliers
    let finalPrice = distancePrice;
    finalPrice *= surgeMultiplier;
    finalPrice *= weatherMultiplier;
    finalPrice *= timeMultiplier;
    finalPrice *= trafficMultiplier;

    // Express delivery surcharge
    const expressMultiplier = params.urgency === 'express' ? 1.5 : 1;
    finalPrice *= expressMultiplier;

    // Round to nearest 100 TZS
    finalPrice = Math.ceil(finalPrice / 100) * 100;

    // Cache the price for 30 seconds
    const cacheKey = `price:${params.distance}:${params.vehicleType}`;
    await redis.setex(cacheKey, 30, JSON.stringify({
      finalPrice,
      surgeMultiplier,
      breakdown: {
        basePrice: distancePrice,
        surge: surgeMultiplier,
        weather: weatherMultiplier,
        time: timeMultiplier,
        traffic: trafficMultiplier,
         urgency: expressMultiplier
      }
    }));

    return {
      finalPrice,
      breakdown: {
        distance: distancePrice,
        surgeMultiplier,
        weatherMultiplier,
        timeMultiplier,
        trafficMultiplier,
        expressMultiplier
      },
      surgeMultiplier
    };
  }

  private async getCurrentDemand(areaRadius: number): Promise<number> {
    // Calculate demand based on pending orders in area
    const pendingOrders = await prisma.order.count({
      where: {
        status: 'pending',
        createdAt: { gte: new Date(Date.now() - 15 * 60000) } // Last 15 min
      }
    });
    
    const normalDemand = 50; // Baseline
    const demandFactor = Math.min(pendingOrders / normalDemand, 3.0);
    return demandFactor;
  }

  private async getAvailableDrivers(areaRadius: number): Promise<number> {
    const activeDrivers = await redis.scard('online:drivers');
    const normalSupply = 100;
    const supplyFactor = Math.min(activeDrivers / normalSupply, 1.0);
    return supplyFactor;
  }

  private calculateSurgeMultiplier(demand: number, supply: number): number {
    const ratio = demand / Math.max(supply, 0.1);
    let multiplier = 1.0;
    
    if (ratio > 2.0) multiplier = 2.5;
    else if (ratio > 1.5) multiplier = 2.0;
    else if (ratio > 1.2) multiplier = 1.5;
    else if (ratio > 1.0) multiplier = 1.2;
    
    return multiplier;
  }

  private async getWeatherConditions(area: number): Promise<string> {
    // Integrate with weather API
    const cached = await redis.get('weather:dar');
    if (cached) return cached;
    
    // Simulated weather check
    const weather = ['sunny', 'cloudy', 'rainy', 'stormy'][Math.floor(Math.random() * 4)];
    await redis.setex('weather:dar', 1800, weather);
    return weather;
  }

  private getWeatherMultiplier(weather: string): number {
    const multipliers: Record<string, number> = {
      sunny: 1.0,
      cloudy: 1.1,
      rainy: 1.3,
      stormy: 1.6
    };
    return multipliers[weather] || 1.0;
  }

  private getTimeMultiplier(): number {
    const hour = new Date().getHours();
    // Peak hours: 7-9 AM, 5-8 PM
    if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 20)) {
      return 1.3;
    }
    // Late night: 10 PM - 5 AM
    if (hour >= 22 || hour <= 5) {
      return 1.5;
    }
    return 1.0;
  }

  private async getTrafficConditions(area: number): Promise<string> {
    // Integrate with Google Maps or TomTom API
    const cached = await redis.get('traffic:dar');
    if (cached) return cached;
    
    const traffic = ['low', 'medium', 'high'];
    const level = traffic[Math.floor(Math.random() * 3)];
    await redis.setex('traffic:dar', 300, level);
    return level;
  }

  private getTrafficMultiplier(traffic: string): number {
    const multipliers: Record<string, number> = { low: 1.0, medium: 1.2, high: 1.4 };
    return multipliers[traffic] || 1.0;
  }
}

export default new DynamicPricingService();