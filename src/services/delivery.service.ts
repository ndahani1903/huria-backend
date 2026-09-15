import { calculateDistance } from '../utils/distance';

export interface DeliveryFeeParams {
  distanceKm: number;
  vehicleType?: 'motorcycle' | 'bajaj' | 'truck';
  hour?: number;
  isRaining?: boolean;
}

export interface DeliveryFeeResult {
  deliveryFee: number;
  surgeMultiplier: number;
  baseFee: number;
  distanceKm: number;
  vehicleType: string;
  breakdown: {
    baseFare: number;
    perKmRate: number;
    distanceCharge: number;
    surgeAmount: number;
  };
}

export class DeliveryFeeService {
  // ============ VEHICLE-BASED RATES (REALISTIC) ============
  private static readonly VEHICLE_RATES: Record<string, { baseFare: number; perKmRate: number; maxDistance: number }> = {
    motorcycle: {
      baseFare: 1500,        // TZS
      perKmRate: 300,       // TZS per km
      maxDistance: 15      // km
    },
    bajaj: {
      baseFare: 2500,        // TZS
      perKmRate: 500,       // TZS per km
      maxDistance: 30      // km
    },
    truck: {
      baseFare: 5000,        // TZS
      perKmRate: 800,       // TZS per km
      maxDistance: 50      // km
    }
  };
  
  // ============ SURGE MULTIPLIERS ============
  private static readonly PEAK_SURGE = 1.3;     // 30% (7-9am, 5-8pm)
  private static readonly NIGHT_SURGE = 1.2;   // 20% (10pm-5am)
  private static readonly RAIN_SURGE = 1.3;   // 30%

  // ============ MIN/MAX LIMITS ============
  private static readonly MIN_FEE = 2000;         // Minimum delivery fee
  private static readonly MAX_FEE = 35000;       // Maximum delivery fee

  
  /**
   * Calculate surge multiplier based on conditions
   */
  static calculateSurgeMultiplier(params: { hour?: number; isRaining?: boolean }): number {
    const hour = params.hour ?? new Date().getHours();
    const isPeak = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 20);
    const isNight = hour >= 22 || hour <= 5;
    
    let multiplier = 1.0;
    if (isPeak) multiplier *= this.PEAK_SURGE;
    if (isNight) multiplier *= this.NIGHT_SURGE;
    if (params.isRaining) multiplier *= this.RAIN_SURGE;
    
    return Math.min(multiplier, 2.0);     // Cap at 2x
  }
  
   /**
   * Get vehicle type based on total weight
   */
  static getVehicleFromWeight(totalWeightKg: number): 'motorcycle' | 'bajaj' | 'truck' {
    if (totalWeightKg <= 15) return 'motorcycle';
    if (totalWeightKg <= 50) return 'bajaj';
    return 'truck';
  }


  /**
   * Calculate delivery fee based on distance and vehicle type
   * This is the SINGLE SOURCE OF TRUTH for delivery fees
   */
  static calculateDeliveryFee(params: DeliveryFeeParams): DeliveryFeeResult {

   const vehicleType = params.vehicleType || 'motorcycle';
    const rates = this.VEHICLE_RATES[vehicleType];
    
    if (!rates) {
      throw new Error(`Unknown vehicle type: ${vehicleType}`);
    }
    
    // Calculate base fee
    const distanceCharge = params.distanceKm * rates.perKmRate;
    let baseFee = rates.baseFare + distanceCharge;
    
    // Apply min/max limits
    baseFee = Math.max(this.MIN_FEE, Math.min(this.MAX_FEE, baseFee));
    
    // Apply surge multiplier
    const hour = params.hour ?? new Date().getHours();
    const surgeMultiplier = this.calculateSurgeMultiplier({ 
      hour, 
      isRaining: params.isRaining 
    });

    const deliveryFee = Math.round(baseFee * surgeMultiplier);
    const surgeAmount = deliveryFee - baseFee;

   console.log(`📊 Delivery Fee Calculation:
    Vehicle: ${vehicleType}
    Distance: ${params.distanceKm} km
    Base Fare: ${rates.baseFare} TZS
    Per KM Rate: ${rates.perKmRate} TZS/km
    Distance Charge: ${distanceCharge} TZS
    Base Fee: ${baseFee} TZS
    Surge Multiplier: ${surgeMultiplier}
    Surge Amount: ${surgeAmount} TZS
    Final Fee: ${deliveryFee} TZS
    Max Distance: ${rates.maxDistance} km`);


    return {
      deliveryFee,
      surgeMultiplier,
      baseFee,
      distanceKm: params.distanceKm,
      vehicleType,
      breakdown: {
        baseFare: rates.baseFare,
        perKmRate: rates.perKmRate,
        distanceCharge,
        surgeAmount
      }
    };
  }
  
  /**
   * Calculate delivery fee for a single merchant pickup to delivery address
   */
  static async calculateForMerchant(
    merchantLat: number,
    merchantLng: number,
    deliveryLat: number,
    deliveryLng: number,
    vehicleType?: 'motorcycle' | 'bajaj' | 'truck',
    options?: { hour?: number; isRaining?: boolean }
  ): Promise<DeliveryFeeResult> {
    const distance = calculateDistance(merchantLat, merchantLng, deliveryLat, deliveryLng);
    return this.calculateDeliveryFee({
      distanceKm: distance,
      vehicleType,
      hour: options?.hour,
      isRaining: options?.isRaining
    });
  }
} 