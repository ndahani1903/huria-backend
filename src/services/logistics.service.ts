// src/services/logistics.service.ts

import { prisma } from '../config/db';
import {
  WeightBracket,
  VehicleType,
  ShippingMode,
  WEIGHT_BRACKET_VALUES,
  CartItemLogistics,
  LogisticsEvaluationResult,
  Coordinates
} from '../types/logistics.types';
import { calculateHaversineDistance } from '../utils/distance.utils';
import { DeliveryFeeService } from './delivery.service';

/**
 * Safely convert Prisma JsonValue into an object.
 */
const getJsonObject = (
  value: unknown
): Record<string, unknown> => {
  if (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return {};
};

export class LogisticsService {
  
  private static readonly MAX_LOCAL_RADIUS_KM = 45.0;
  
  // Local delivery base rates (TZS)
  private static readonly LOCAL_BASE_RATES: Record<
    VehicleType,
    number
  > = {
    motorcycle: 1500,
    bajaj: 3000,
    truck: 7000
  };
  
  // Local delivery per-km rates (TZS)
  private static readonly LOCAL_PER_KM_RATES: Record<
    VehicleType,
    number
  > = {
    motorcycle: 200,
    bajaj: 400,
    truck: 800
  };
  
  // FBU Courier base fees (TZS)
  private static readonly FBU_BASE_FEE = 12000;
  
  // Weight surcharges for FBU (TZS)
  private static readonly FBU_WEIGHT_SURCHARGES = [
    {
      maxWeight: 5,
      surcharge: 0
    },
    {
      maxWeight: 15,
      surcharge: 3000
    },
    {
      maxWeight: 30,
      surcharge: 7000
    },
    {
      maxWeight: Infinity,
      surcharge: 15000
    }
  ];
  
  /**
   * Evaluates cart logistics.
   * Determines vehicle type and shipping mode.
   */
  public static evaluateCartLogistics(
    cartItems: CartItemLogistics[],
    merchantCoords: Coordinates,
    customerCoords: Coordinates,
    options?: {
      hour?: number;
      isRaining?: boolean;
    }
  ): LogisticsEvaluationResult {
    
    if (cartItems.length === 0) {
      return {
        totalWeight: 0,
        allowedVehiclesInCart: [],
        systemSuggestedVehicle: 'motorcycle',
        finalVehicle: 'motorcycle',
        shippingMode: 'LOCAL_DISPATCH',
        distanceKm: 0,
        deliveryFee: 0,
        deliveryTimeline:
          'Today (Within 1-3 hours)',
        isOutOfRange: false,
        surgeMultiplier: 1,
        baseFee: 0,
        surgeAmount: 0
      };
    }
    
    // Step 1:
    // Calculate total weight and intersect
    // vehicle restrictions.
    let totalWeight = 0;

    let allowedVehiclesInCart: VehicleType[] = [
      'motorcycle',
      'bajaj',
      'truck'
    ];
    
    for (const item of cartItems) {
      const itemWeight =
        WEIGHT_BRACKET_VALUES[
          item.weightBracket
        ];

      totalWeight +=
        itemWeight *
        item.quantity;
      
      allowedVehiclesInCart =
        allowedVehiclesInCart.filter(
          vehicle =>
            item.allowedVehicles.includes(
              vehicle
            )
        );
    }
    
    // Step 2:
    // System suggests base vehicle purely by weight.
    let systemSuggestedVehicle:
      VehicleType = 'motorcycle';

    if (
      totalWeight > 15 &&
      totalWeight <= 30
    ) {
      systemSuggestedVehicle =
        'bajaj';
    }
    else if (
      totalWeight > 30
    ) {
      systemSuggestedVehicle =
        'truck';
    }
    
    // Step 3:
    // Safety & Merchant Rule Hierarchy.
    let finalVehicle =
      systemSuggestedVehicle;
    
    // Safety override:
    // Weight is physically too heavy.
    if (totalWeight > 30) {
      finalVehicle = 'truck';
    }
    else if (
      totalWeight > 15 &&
      systemSuggestedVehicle === 'bajaj'
    ) {
      if (
        !allowedVehiclesInCart.includes(
          'bajaj'
        ) &&
        allowedVehiclesInCart.includes(
          'truck'
        )
      ) {
        finalVehicle = 'truck';
      }
      else if (
        !allowedVehiclesInCart.includes(
          'bajaj'
        ) &&
        !allowedVehiclesInCart.includes(
          'truck'
        )
      ) {
        finalVehicle = 'bajaj';
      }
    }
    
    // Merchant override:
    // Fragile/restricted item requires
    // specific vehicle.
    if (
      !allowedVehiclesInCart.includes(
        systemSuggestedVehicle
      )
    ) {
      if (
        systemSuggestedVehicle ===
        'motorcycle'
      ) {
        if (
          allowedVehiclesInCart.includes(
            'bajaj'
          )
        ) {
          finalVehicle = 'bajaj';
        }
        else if (
          allowedVehiclesInCart.includes(
            'truck'
          )
        ) {
          finalVehicle = 'truck';
        }
      }
      else if (
        systemSuggestedVehicle ===
          'bajaj' &&
        allowedVehiclesInCart.includes(
          'truck'
        )
      ) {
        finalVehicle = 'truck';
      }
    }
    
    // Step 4:
    // Calculate distance and determine
    // shipping mode.
    const distanceKm =
      calculateHaversineDistance(
        merchantCoords,
        customerCoords
      );

    const isOutOfRange =
      distanceKm >
      this.MAX_LOCAL_RADIUS_KM;
    
    let shippingMode: ShippingMode;
    let deliveryFee: number;
    let deliveryTimeline: string;
    let surgeMultiplier = 1;
    let baseFee = 0;
    let surgeAmount = 0;

    if (isOutOfRange) {
      shippingMode =
        'FBU_COURIER';

      // FBU flat-rate pricing.
      let fbuFlatRate = 0;
      let timeline = '';
      
      if (distanceKm <= 100) {
        fbuFlatRate = 8000;
        timeline =
          '1 - 2 Business Days';
      }
      else if (distanceKm <= 300) {
        fbuFlatRate = 12000;
        timeline =
          '2 - 3 Business Days';
      }
      else if (distanceKm <= 600) {
        fbuFlatRate = 18000;
        timeline =
          '3 - 4 Business Days';
      }
      else {
        fbuFlatRate = 25000;
        timeline =
          '4 - 5 Business Days';
      }
      
      // Apply weight surcharge.
      let weightSurcharge = 0;

      if (totalWeight > 15) {
        weightSurcharge = 3000;
      }

      if (totalWeight > 30) {
        weightSurcharge = 7000;
      }

      if (totalWeight > 50) {
        weightSurcharge = 12000;
      }
      
      deliveryFee =
        fbuFlatRate +
        weightSurcharge;

      deliveryTimeline =
        timeline;

      // FBU does not use local vehicle
      // selection.
      finalVehicle =
        null as any;

      systemSuggestedVehicle =
        null as any;

      console.log(
        `🏭 FBU Flat Rate: ${distanceKm.toFixed(1)}km, ${totalWeight}kg → TZS ${deliveryFee.toLocaleString()} (${timeline})`
      );
      
      // No surge pricing for FBU.
      surgeMultiplier = 1;
      baseFee = deliveryFee;
      surgeAmount = 0;

      console.log(
        `🏭 FBU: ${distanceKm.toFixed(1)}km, ${totalWeight}kg → TZS ${deliveryFee.toLocaleString()} (${timeline})`
      );
    }
    else {
      shippingMode =
        'LOCAL_DISPATCH';

      // DeliveryFeeService is the
      // single source of truth.
      const surgeParams = {
        hour:
          options?.hour ??
          new Date().getHours(),

        isRaining:
          options?.isRaining ??
          false
      };
      
      const feeResult =
        DeliveryFeeService.calculateDeliveryFee({
          distanceKm,
          vehicleType: finalVehicle,
          hour: surgeParams.hour,
          isRaining:
            surgeParams.isRaining
        });
      
      deliveryFee =
        feeResult.deliveryFee;

      surgeMultiplier =
        feeResult.surgeMultiplier;

      baseFee =
        feeResult.baseFee;

      surgeAmount =
        feeResult.breakdown.surgeAmount;
      
      deliveryTimeline =
        this.getDeliveryTimeline(
          surgeMultiplier,
          distanceKm
        );
    }
    
    return {
      totalWeight,
      allowedVehiclesInCart,
      systemSuggestedVehicle,
      finalVehicle,
      shippingMode,
      distanceKm,
      deliveryFee,
      deliveryTimeline,
      isOutOfRange,
      surgeMultiplier,
      baseFee,
      surgeAmount
    };
  }
  
  /**
   * Get delivery timeline based on
   * surge and distance.
   */
  private static getDeliveryTimeline(
    surgeMultiplier: number,
    distanceKm: number
  ): string {
    if (surgeMultiplier >= 1.5) {
      return 'High Demand - Delivery may take 2-4 hours';
    }

    if (surgeMultiplier >= 1.2) {
      return 'Peak Hours - Delivery within 1-3 hours';
    }

    if (distanceKm > 20) {
      return 'Long Distance - Delivery within 2-4 hours';
    }

    return 'Today (Within 1-3 hours)';
  }

  /**
   * Get product logistics info from database.
   */
  public static async getProductLogisticsInfo(
    productId: string
  ) {
    const product =
      await prisma.product.findUnique({
        where: {
          id: productId
        },
        select: {
          id: true,
          weightBracket: true,
          allowedVehicles: true,
          name: true,
          price: true
        }
      });
    
    if (!product) {
      throw new Error(
        `Product ${productId} not found`
      );
    }
    
    return {
      productId: product.id,
      weightBracket:
        product.weightBracket as WeightBracket,
      allowedVehicles:
        product.allowedVehicles as VehicleType[],
      name: product.name,
      price: product.price
    };
  }
  
  /**
   * Batch get logistics info for multiple products.
   */
  public static async getBatchLogisticsInfo(
    productIds: string[]
  ) {
    const products =
      await prisma.product.findMany({
        where: {
          id: {
            in: productIds
          }
        },
        select: {
          id: true,
          weightBracket: true,
          allowedVehicles: true,
          name: true,
          price: true,
          merchantId: true,
          merchant: {
            select: {
              pickupLat: true,
              pickupLng: true,
              businessName: true
            }
          }
        }
      });
    
    return products.map(p => ({
      productId: p.id,
      weightBracket:
        p.weightBracket as WeightBracket,
      allowedVehicles:
        p.allowedVehicles as VehicleType[],
      name: p.name,
      price: p.price,
      merchantId: p.merchantId,
      merchantLocation:
        p.merchant?.pickupLat &&
        p.merchant?.pickupLng
          ? {
              lat: p.merchant.pickupLat,
              lng: p.merchant.pickupLng
            }
          : null
    }));
  }
  
  /**
   * Create FBU Warehouse Request
   * after order is paid.
   */
  public static async createFBUWarehouseRequest(
    orderId: string
  ) {
    const order =
      await prisma.order.findUnique({
        where: {
          orderId
        },
        include: {
          merchant: true,
          items: {
            include: {
              product: true
            }
          },
          user: true
        }
      });
    
    if (!order) {
      throw new Error(
        `Order ${orderId} not found`
      );
    }
    
    // Calculate total weight.
    let totalWeight = 0;

    const itemsData =
      order.items.map(item => {
        const weightBracket =
          (
            item.product as any
          ).weightBracket as
            | WeightBracket
            | undefined ||
          'LIGHT';

        const itemWeight =
          WEIGHT_BRACKET_VALUES[
            weightBracket
          ];

        totalWeight +=
          itemWeight *
          item.quantity;
        
        return {
          productId:
            item.productId,

          productName:
            item.product.name,

          quantity:
            item.quantity,

          price:
            item.price,

          weightBracket,

          estimatedWeight:
            itemWeight
        };
      });
    
    // Read existing order metadata safely.
    const orderMetadata =
      getJsonObject(
        order.metadata
      );

    const metadataDistance =
      orderMetadata.distanceKm;

    const distanceText =
      metadataDistance !== undefined &&
      metadataDistance !== null
        ? String(metadataDistance)
        : 'unknown';

    // Create FBU request.
    const fbuRequest =
      await prisma.fBUWarehouseRequest.create({
        data: {
          orderId:
            order.orderId,

          merchantId:
            order.merchantId,

          merchantName:
            order.merchant?.businessName ||
            order.merchant?.name ||
            'Unknown',

          merchantPhone:
            order.merchant?.phone ||
            '',

          merchantAddress:
            order.pickupAddress ||
            '',

          merchantPickupLat:
            order.pickupLat,

          merchantPickupLng:
            order.pickupLng,

          items:
            itemsData,

          totalWeight,

          totalAmount:
            order.finalAmount ||
            order.amount,

          status:
            'pending_pickup',

          notes:
            `Auto-generated FBU request for out-of-range order. Distance: ${distanceText}km`
        }
      });
    
    // Update order with FBU metadata.
    await prisma.order.update({
      where: {
        orderId
      },
      data: {
        shippingMode:
          'FBU_COURIER',

        logisticsMetadata: {
          fbuRequestId:
            fbuRequest.id,

          totalWeight,

          warehouseStatus:
            'pending_pickup'
        }
      }
    });
    
    // Emit socket event.
    const { io } =
      await import('../server');

    io.emit(
      'fbu:new-request',
      {
        requestId:
          fbuRequest.id,

        orderId:
          order.orderId,

        merchantName:
          order.merchant?.businessName,

        totalWeight,

        createdAt:
          new Date()
      }
    );
    
    return fbuRequest;
  }
  
  /**
   * Get all FBU warehouse requests
   * for admin.
   */
  public static async getFBUWarehouseRequests(
    status?: string
  ) {
    const where: any = {};

    if (status) {
      where.status = status;
    }
    
    const requests =
      await prisma.fBUWarehouseRequest.findMany({
        where,
        orderBy: {
          createdAt: 'desc'
        }
      });
    
    return requests;
  }
  
  /**
   * Update FBU request status.
   */
  public static async updateFBURequestStatus(
    requestId: string,
    status: string,
    updates?: any
  ) {
    const data: any = {
      status,
      updatedAt: new Date()
    };
    
    if (
      status === 'pickup_scheduled' &&
      updates?.scheduledAt
    ) {
      data.pickupScheduledAt =
        new Date(
          updates.scheduledAt
        );
    }

    if (status === 'picked_up') {
      data.pickupCompletedAt =
        new Date();
    }

    if (
      status ===
      'warehouse_received'
    ) {
      data.warehouseReceivedAt =
        new Date();
    }

    if (
      updates?.assignedWarehouseStaffId
    ) {
      data.assignedWarehouseStaffId =
        updates.assignedWarehouseStaffId;
    }

    if (updates?.notes) {
      data.notes =
        updates.notes;
    }
    
    const updated =
      await prisma.fBUWarehouseRequest.update({
        where: {
          id: requestId
        },
        data
      });
    
    // Emit socket update.
    const { io } =
      await import('../server');

    io.emit(
      'fbu:request-updated',
      {
        requestId,
        status,
        updatedAt: new Date()
      }
    );
    
    return updated;
  }
}