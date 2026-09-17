// src/modules/disputes/dispute.controller.ts

import { Request, Response } from 'express';
import { DisputeService } from './dispute.service';
import { AuthRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../config/db';
import { io } from '../../server';

function getParamString(
  value: string | string[] | undefined
): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && value.length > 0) {
    return value[0];
  }

  throw new Error('Missing route parameter');
}

export class DisputeController {

  // Customer creates a dispute
  static async create(req: AuthRequest, res: Response) {
    try {
      const { orderId, reason } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          error: 'Unauthorized',
        });
      }

      if (!orderId) {
        return res.status(400).json({
          error: 'Order ID is required',
        });
      }

      if (!reason) {
        return res.status(400).json({
          error: 'Dispute reason is required',
        });
      }

      // Verify order belongs to user.
      // Include the user because customerName below uses order.user.
      const order = await prisma.order.findFirst({
        where: {
          id: orderId,
          userId: userId,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
        },
      });

      if (!order) {
        return res.status(404).json({
          error: 'Order not found',
        });
      }

      // Check if dispute already exists
      const existingDispute = await prisma.dispute.findFirst({
        where: {
          orderId,
        },
      });

      if (existingDispute) {
        return res.status(400).json({
          error: 'Dispute already exists for this order',
        });
      }

      const dispute = await DisputeService.create(
        orderId,
        reason
      );

      io.emit('admin:new-dispute', {
        disputeId: dispute.id,
        orderId: dispute.orderId,
        reason: dispute.reason,
        createdAt: dispute.createdAt,
        customerName: order.user?.name,
      });

      return res.json({
        success: true,
        dispute,
      });
    } catch (error: any) {
      console.error('Create dispute error:', error);

      return res.status(500).json({
        error:
          error?.message ||
          'Failed to create dispute',
      });
    }
  }

  // Admin resolves a dispute
  static async resolve(req: AuthRequest, res: Response) {
    try {
      const {
        disputeId,
        resolution,
        notes,
      } = req.body;

      const adminId = req.user?.id;

      if (!adminId) {
        return res.status(401).json({
          error: 'Unauthorized',
        });
      }

      if (!disputeId) {
        return res.status(400).json({
          error: 'Dispute ID is required',
        });
      }

      const result = await DisputeService.resolve(
        disputeId,
        adminId,
        resolution,
        notes
      );

      return res.json({
        success: true,
        dispute: result,
      });
    } catch (error: any) {
      console.error('Resolve dispute error:', error);

      return res.status(500).json({
        error:
          error?.message ||
          'Failed to resolve dispute',
      });
    }
  }

  // Admin rejects a dispute
  static async reject(req: AuthRequest, res: Response) {
    try {
      const {
        disputeId,
        resolution,
        notes,
      } = req.body;

      const adminId = req.user?.id;

      if (!adminId) {
        return res.status(401).json({
          error: 'Unauthorized',
        });
      }

      if (!disputeId) {
        return res.status(400).json({
          error: 'Dispute ID is required',
        });
      }

      const result = await DisputeService.reject(
        disputeId,
        adminId,
        resolution,
        notes
      );

      return res.json({
        success: true,
        dispute: result,
      });
    } catch (error: any) {
      console.error('Reject dispute error:', error);

      return res.status(500).json({
        error:
          error?.message ||
          'Failed to reject dispute',
      });
    }
  }

  // Get all disputes (Admin)
  static async getAll(
    req: AuthRequest,
    res: Response
  ) {
    try {
      const disputes = await DisputeService.getAll();

      const stats = {
        open: disputes.filter(
          d => d.status === 'open'
        ).length,

        resolved: disputes.filter(
          d => d.status === 'resolved'
        ).length,

        rejected: disputes.filter(
          d => d.status === 'rejected'
        ).length,

        total: disputes.length,
      };

      return res.json({
        disputes,
        stats,
      });
    } catch (error: any) {
      console.error('Get all disputes error:', error);

      return res.status(500).json({
        error:
          error?.message ||
          'Failed to fetch disputes',
      });
    }
  }

  // Get dispute by ID
  static async getById(
    req: Request,
    res: Response
  ) {
    try {
      const id = getParamString(req.params.id);

      const dispute =
        await DisputeService.getById(id);

      if (!dispute) {
        return res.status(404).json({
          error: 'Dispute not found',
        });
      }

      return res.json(dispute);
    } catch (error: any) {
      console.error(
        'Get dispute by ID error:',
        error
      );

      return res.status(500).json({
        error:
          error?.message ||
          'Failed to fetch dispute',
      });
    }
  }

  // Get disputes by order
  static async getByOrder(
    req: Request,
    res: Response
  ) {
    try {
      const orderId = getParamString(
        req.params.orderId
      );

      const disputes =
        await DisputeService.getByOrder(orderId);

      return res.json(disputes);
    } catch (error: any) {
      console.error(
        'Get disputes by order error:',
        error
      );

      return res.status(500).json({
        error:
          error?.message ||
          'Failed to fetch disputes',
      });
    }
  }

  // Get dispute statistics
  static async getStats(
    req: Request,
    res: Response
  ) {
    try {
      const stats =
        await DisputeService.getStats();

      return res.json(stats);
    } catch (error: any) {
      console.error(
        'Get dispute stats error:',
        error
      );

      return res.status(500).json({
        error:
          error?.message ||
          'Failed to fetch statistics',
      });
    }
  }

  // Add note to dispute
  static async addNote(
    req: AuthRequest,
    res: Response
  ) {
    try {
      const id = getParamString(
        req.params.id
      );

      const { note } = req.body;
      const adminId = req.user?.id;

      if (!adminId) {
        return res.status(401).json({
          error: 'Unauthorized',
        });
      }

      if (
        !note ||
        typeof note !== 'string' ||
        note.trim().length === 0
      ) {
        return res.status(400).json({
          error: 'Note is required',
        });
      }

      const result =
        await DisputeService.addNote(
          id,
          adminId,
          note.trim()
        );

      return res.json({
        success: true,
        note: result,
      });
    } catch (error: any) {
      console.error(
        'Add dispute note error:',
        error
      );

      return res.status(500).json({
        error:
          error?.message ||
          'Failed to add note',
      });
    }
  }
}