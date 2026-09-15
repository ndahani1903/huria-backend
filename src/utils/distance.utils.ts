// src/utils/distance.utils.ts

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface StoreWithLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  merchantType?: string;
  estimatedDeliveryTime?: number;
  isOpen?: boolean;
}

export interface ProcessedStore {
  store: StoreWithLocation;
  distanceKm: number;
  statusTag: 'NEAR_YOU' | 'AWAY' | 'TOO_FAR';
  isOrderable: boolean;
  estimatedDeliveryMinutes: number;
}


/**
 * Calculates the great-circle distance between two points on the Earth's surface
 * using the Haversine formula. Returns distance in Kilometers.
 */
export function calculateHaversineDistance(pointA: Coordinates, pointB: Coordinates): number {
  const EARTH_RADIUS_KM = 6371;

  const dLat = (pointB.lat - pointA.lat) * Math.PI / 180;
  const dLng = (pointB.lng - pointA.lng) * Math.PI / 180;

  const latAInRad = pointA.lat * Math.PI / 180;
  const latBInRad = pointB.lat * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.sin(dLng / 2) * Math.sin(dLng / 2) * 
            Math.cos(latAInRad) * Math.cos(latBInRad);
            
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return EARTH_RADIUS_KM * c;
}

/**
 * Calculate distance using Mapbox (more accurate for road distance)
 */
export async function calculateMapboxDistance(
  origin: Coordinates, 
  destination: Coordinates,
  accessToken: string
): Promise<number> {
  const response = await fetch(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?access_token=${accessToken}`
  );
  const data = await response.json();
  if (data.routes && data.routes[0]) {
    return data.routes[0].distance / 1000; // Convert meters to km
  }
  return calculateHaversineDistance(origin, destination);
}

/**
 * Process stores with distance-based rules
 */
export function processNearbyStores(
  userCoords: Coordinates,
  stores: StoreWithLocation[]
): ProcessedStore[] {
  return stores.map(store => {
    const distance = calculateHaversineDistance(userCoords, {
      lat: store.latitude,
      lng: store.longitude
    });
    
    let statusTag: 'NEAR_YOU' | 'AWAY' | 'TOO_FAR' = 'NEAR_YOU';
    let isOrderable = true;
    let estimatedDeliveryMinutes = 30;
    
    // Apply delivery rules based on distance
    if (distance <= 5) {
      statusTag = 'NEAR_YOU';
      estimatedDeliveryMinutes = 20 + Math.floor(distance * 2); // 20-30 min
    } else if (distance > 5 && distance <= 10) {
      statusTag = 'NEAR_YOU';
      estimatedDeliveryMinutes = 30 + Math.floor(distance * 1.5); // 30-45 min
    } else if (distance > 10 && distance <= 20) {
      statusTag = 'AWAY';
      estimatedDeliveryMinutes = 45 + Math.floor(distance * 1.2); // 45-70 min
    } else if (distance > 20 && distance <= 40) {
      statusTag = 'AWAY';
      estimatedDeliveryMinutes = 60 + Math.floor(distance * 1); // 60-100 min
    } else {
      statusTag = 'TOO_FAR';
      isOrderable = false;
      estimatedDeliveryMinutes = 999; // Not deliverable
    }
    
    // Override if store has its own estimated time
    if (store.estimatedDeliveryTime) {
      estimatedDeliveryMinutes = store.estimatedDeliveryTime;
    }
    
    // Check if store is open
    if (store.isOpen === false) {
      isOrderable = false;
    }
    
    return {
      store,
      distanceKm: parseFloat(distance.toFixed(1)),
      statusTag,
      isOrderable,
      estimatedDeliveryMinutes
    };
  }).sort((a, b) => a.distanceKm - b.distanceKm); // Sort by closest first
}

/**
 * Get delivery fee based on distance and merchant type
 */
export function calculateDeliveryFee(
  distanceKm: number,
  merchantType: string,
  orderAmount: number
): number {
  let baseFee = 0;
  
  if (merchantType === 'RESTAURANT') {
    baseFee = 2000;
    if (distanceKm > 5) baseFee += Math.ceil(distanceKm - 5) * 500;
    if (orderAmount > 50000) baseFee = Math.max(0, baseFee - 1000); // Discount for large orders
  } else if (merchantType === 'SUPERMARKET') {
    baseFee = 3000;
    if (distanceKm > 5) baseFee += Math.ceil(distanceKm - 5) * 400;
    if (orderAmount > 100000) baseFee = 0; // Free delivery for large orders
  } else {
    baseFee = 1500;
    if (distanceKm > 5) baseFee += Math.ceil(distanceKm - 5) * 300;
  }
  
  return Math.min(baseFee, 15000); // Cap at 15,000 TZS
}