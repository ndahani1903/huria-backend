import axios from 'axios';
import { prisma } from '../config/db';
import { redis } from '../config/redis';

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:5001';

export class ForecastService {
  
  // Get demand forecast for a merchant
  static async getDemandForecast(merchantId: string, days: number = 7) {
    // Check cache first
    const cacheKey = `forecast:merchant:${merchantId}:${days}d`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached as string);
    }
    
    try {
      const response = await axios.post(`${PYTHON_SERVICE_URL}/api/forecast/demand`, {
        merchant_id: merchantId,
        days
      });
      
      // Cache for 1 hour
      await redis.setex(cacheKey, 3600, JSON.stringify(response.data));
      
      return response.data;
    } catch (error) {
      console.error('Forecast API error:', error);
      return null;
    }
  }
  
  // Get restock recommendations
  static async getRestockRecommendations(merchantId: string) {
    const cacheKey = `forecast:restock:${merchantId}`;
    const cached = await redis.get(cacheKey);
    
    if (cached) {
      return JSON.parse(cached as string);
    }
    
    try {
      const response = await axios.get(`${PYTHON_SERVICE_URL}/api/forecast/restock/${merchantId}`);
      
      // Cache for 30 minutes
      await redis.setex(cacheKey, 1800, JSON.stringify(response.data));
      
      return response.data;
    } catch (error) {
      console.error('Restock API error:', error);
      return [];
    }
  }
  
  // Get optimal pricing recommendation
  static async getOptimalPricing(merchantId: string, productId: string) {
    try {
      const response = await axios.post(`${PYTHON_SERVICE_URL}/api/forecast/pricing`, {
        merchant_id: merchantId,
        product_id: productId
      });
      
      return response.data;
    } catch (error) {
      console.error('Pricing API error:', error);
      return null;
    }
  }
  
  // Get alerts for merchant
// Get alerts for merchant
static async getAlerts(merchantId: string) {
  const result = await redis.lrange(`forecast:alerts:${merchantId}`, 0, -1);

  const alerts = Array.isArray(result) ? result : [];

  return alerts.map((alert: any) =>
    JSON.parse(alert.toString())
  );
}
  
}

export default ForecastService;