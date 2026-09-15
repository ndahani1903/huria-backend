// src/types/logistics.types.ts

export type WeightBracket = 'LIGHT' | 'MEDIUM' | 'HEAVY' | 'VERY_HEAVY' | 'BULK';
export type VehicleType = 'motorcycle' | 'bajaj' | 'truck';
export type ShippingMode = 'LOCAL_DISPATCH' | 'FBU_COURIER';
export type FBURequestStatus = 'pending_pickup' | 'pickup_scheduled' | 'picked_up' | 'warehouse_received' | 'dispatched' | 'completed';

export const WEIGHT_BRACKET_VALUES: Record<WeightBracket, number> = {
  LIGHT: 1.0,        // 0-2kg average
  MEDIUM: 3.5,       // 2.1-5kg average
  HEAVY: 10.0,       // 5.1-15kg average
  VERY_HEAVY: 22.0,  // 15.1-30kg average
  BULK: 40.0         // 30+ kg average
};

export const WEIGHT_BRACKET_RANGES: Record<WeightBracket, { min: number; max: number }> = {
  LIGHT: { min: 0, max: 2 },
  MEDIUM: { min: 2.1, max: 5 },
  HEAVY: { min: 5.1, max: 15 },
  VERY_HEAVY: { min: 15.1, max: 30 },
  BULK: { min: 30.1, max: Infinity }
};

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface CartItemLogistics {
  productId: string;
  quantity: number;
  weightBracket: WeightBracket;
  allowedVehicles: VehicleType[];
}

export interface LogisticsEvaluationResult {
  totalWeight: number;
  allowedVehiclesInCart: VehicleType[];
  systemSuggestedVehicle: VehicleType;
  finalVehicle: VehicleType;
  shippingMode: ShippingMode;
  distanceKm: number;
  deliveryFee: number;
  deliveryTimeline: string;
  isOutOfRange: boolean;
  // ✅ NEW SURGE FIELDS
  surgeMultiplier: number;
  baseFee: number;
  surgeAmount: number;
}

export interface FBUWarehouseRequest {
  id: string;
  orderId: string;
  merchantId: string;
  merchantName: string;
  merchantPhone: string;
  merchantAddress: string;
  merchantPickupLat: number;
  merchantPickupLng: number;
  items: any[];
  totalWeight: number;
  totalAmount: number;
  status: FBURequestStatus;
  pickupScheduledAt?: Date;
  pickupCompletedAt?: Date;
  warehouseReceivedAt?: Date;
  assignedWarehouseStaffId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}