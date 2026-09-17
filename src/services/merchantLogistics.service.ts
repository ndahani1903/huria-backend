// src/services/merchantLogistics.service.ts

import { prisma } from '../config/db';
import {
  WeightBracket,
  VehicleType,
  WEIGHT_BRACKET_RANGES
} from '../types/logistics.types';

export class MerchantLogisticsService {
  
  /**
   * Update product logistics settings
   */
  public static async updateProductLogistics(
    productId: string,
    merchantId: string,
    data: {
      weightBracket?: WeightBracket;
      allowedVehicles?: VehicleType[];
    }
  ) {
    // Verify product belongs to merchant
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        merchantId
      }
    });
    
    if (!product) {
      throw new Error('Product not found or unauthorized');
    }
    
    const updated = await prisma.product.update({
      where: {
        id: productId
      },
      data: {
        weightBracket: data.weightBracket,
        allowedVehicles: data.allowedVehicles
      }
    });
    
    return updated;
  }
  
  /**
   * Get weight bracket from actual weight
   */
  public static getWeightBracketFromWeight(
    weightKg: number
  ): WeightBracket {
    for (const [bracket, range] of Object.entries(
      WEIGHT_BRACKET_RANGES
    )) {
      if (
        weightKg >= range.min &&
        weightKg <= range.max
      ) {
        return bracket as WeightBracket;
      }
    }
    
    return 'BULK';
  }
  
  /**
   * Get merchant's FBU pickup requests
   */
  public static async getMerchantFBURequests(
    merchantId: string
  ) {
    try {
      const requests =
        await prisma.fBUWarehouseRequest.findMany({
          where: {
            merchantId
          },
          orderBy: {
            createdAt: 'desc'
          }
        });
      
      return requests;
    } catch (error) {
      console.error(
        'Error fetching FBU requests:',
        error
      );
      
      return [];
    }
  }
  
  /**
   * Get FBU request by ID for merchant
   */
  public static async getMerchantFBURequest(
    merchantId: string,
    requestId: string
  ) {
    const request =
      await prisma.fBUWarehouseRequest.findFirst({
        where: {
          id: requestId,
          merchantId
        }
      });
    
    if (!request) {
      throw new Error(
        'FBU request not found'
      );
    }
    
    return request;
  }
  
  /**
   * Confirm pickup scheduled
   * Merchant acknowledges the pickup schedule.
   */
  public static async merchantConfirmPickupSchedule(
    merchantId: string,
    requestId: string,
    scheduledAt: Date
  ) {
    const request =
      await prisma.fBUWarehouseRequest.findFirst({
        where: {
          id: requestId,
          merchantId
        }
      });
    
    if (!request) {
      throw new Error(
        'FBU request not found'
      );
    }
    
    if (request.status !== 'pending_pickup') {
      throw new Error(
        `Cannot schedule pickup for request with status: ${request.status}`
      );
    }
    
    const updated =
      await prisma.fBUWarehouseRequest.update({
        where: {
          id: requestId
        },
        data: {
          status: 'pickup_scheduled',
          pickupScheduledAt: scheduledAt,
          updatedAt: new Date()
        }
      });
    
    return updated;
  }
}