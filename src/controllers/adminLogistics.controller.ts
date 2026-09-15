// src/controllers/adminLogistics.controller.ts

import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../config/db';

export class AdminLogisticsController {
  
  /**
   * Get all FBU warehouse requests (admin)
   */
  static async getAllFBURequests(req: AuthRequest, res: Response) {
    try {
      const { status } = req.query;
      
      const where: any = {};
      if (status && status !== 'all') {
        where.status = status;
      }
      
      // ✅ Use correct model name: fBUWarehouseRequest
      const requests = await prisma.fBUWarehouseRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        include: {
          merchant: {
            select: {
              businessName: true,
              name: true
            }
          }
        }
      });
      
      // Format the response
      const formattedRequests = requests.map(req => ({
        id: req.id,
        orderId: req.orderId,
        merchantName: req.merchant?.businessName || req.merchant?.name || req.merchantName,
        totalWeight: req.totalWeight,
        totalAmount: req.totalAmount,
        status: req.status,
        createdAt: req.createdAt,
        pickupScheduledAt: req.pickupScheduledAt,
        items: req.items
      }));
      
      res.json(formattedRequests);
      
    } catch (error: any) {
      console.error('Get FBU requests error:', error);
      // Return empty array instead of error
      res.json([]);
    }
  }
  
  /**
   * Update FBU request status (admin)
   */
  static async updateFBURequestStatus(req: AuthRequest, res: Response) {
    try {
      const { requestId } = req.params;
      const { status, scheduledAt, assignedWarehouseStaffId, notes } = req.body;
      
      const data: any = { 
        status, 
        updatedAt: new Date() 
      };
      
      if (scheduledAt) {
        data.pickupScheduledAt = new Date(scheduledAt);
      }
      if (assignedWarehouseStaffId) {
        data.assignedWarehouseStaffId = assignedWarehouseStaffId;
      }
      if (notes) {
        data.notes = notes;
      }
      
      if (status === 'picked_up') {
        data.pickupCompletedAt = new Date();
      }
      if (status === 'warehouse_received') {
        data.warehouseReceivedAt = new Date();
      }
      
      const updated = await prisma.fBUWarehouseRequest.update({
        where: { id: requestId },
        data
      });
      
      // Log admin action
      await prisma.auditLog.create({
        data: {
          adminId: req.user!.id,
          action: 'UPDATE_FBU_REQUEST',
          targetType: 'fbu_request',
          targetId: requestId,
          meta: { status, assignedWarehouseStaffId },
          severity: 'info'
        }
      });
      
      res.json({ success: true, request: updated });
      
    } catch (error: any) {
      console.error('Update FBU request error:', error);
      res.status(500).json({ error: error.message });
    }
  }
  
  /**
   * Get FBU analytics (admin)
   */
  static async getFBUAnalytics(req: AuthRequest, res: Response) {
    try {
      const [pending, scheduled, pickedUp, received, completed] = await Promise.all([
        prisma.fBUWarehouseRequest.count({ where: { status: 'pending_pickup' } }),
        prisma.fBUWarehouseRequest.count({ where: { status: 'pickup_scheduled' } }),
        prisma.fBUWarehouseRequest.count({ where: { status: 'picked_up' } }),
        prisma.fBUWarehouseRequest.count({ where: { status: 'warehouse_received' } }),
        prisma.fBUWarehouseRequest.count({ where: { status: 'completed' } })
      ]);
      
      const totalRequests = await prisma.fBUWarehouseRequest.count();
      
      const totalWeight = await prisma.fBUWarehouseRequest.aggregate({
        _sum: { totalWeight: true }
      });
      
      const totalAmount = await prisma.fBUWarehouseRequest.aggregate({
        _sum: { totalAmount: true }
      });
      
      res.json({
        summary: {
          pending,
          scheduled,
          pickedUp,
          received,
          completed,
          totalRequests
        },
        totals: {
          totalWeight: totalWeight._sum.totalWeight || 0,
          totalAmount: Number(totalAmount._sum.totalAmount) || 0
        }
      });
      
    } catch (error: any) {
      console.error('Get FBU analytics error:', error);
      // Return empty analytics instead of error
      res.json({
        summary: {
          pending: 0,
          scheduled: 0,
          pickedUp: 0,
          received: 0,
          completed: 0,
          totalRequests: 0
        },
        totals: {
          totalWeight: 0,
          totalAmount: 0
        }
      });
    }
  }
}