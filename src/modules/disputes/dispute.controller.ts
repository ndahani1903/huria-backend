// src/modules/disputes/dispute.controller.ts

import { Request, Response } from 'express';
import { DisputeService } from './dispute.service';
import { AuthRequest } from '../../middleware/auth.middleware';
import { prisma } from '../../config/db';
import { io } from '../../server';

export class DisputeController {
  
  // Customer creates a dispute
  static async create(req: AuthRequest, res: Response) {
    try {
      const { orderId, reason } = req.body;
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Verify order belongs to user
      const order = await prisma.order.findFirst({
        where: { 
          id: orderId,
          userId: userId
        }
      });

      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Check if dispute already exists
      const existingDispute = await prisma.dispute.findFirst({
        where: { orderId }
      });

      if (existingDispute) {
        return res.status(400).json({ error: "Dispute already exists for this order" });
      }

      const dispute = await DisputeService.create(orderId, reason);

      io.emit('admin:new-dispute', {
  disputeId: dispute.id,
  orderId: dispute.orderId,
  reason: dispute.reason,
  createdAt: dispute.createdAt,
  customerName: order.user?.name
});

      res.json({ success: true, dispute });
    } catch (error: any) {
      console.error("Create dispute error:", error);
      res.status(500).json({ error: error.message || 'Failed to create dispute' });
    }
  }

  // ✅ NEW: Admin resolves a dispute
  static async resolve(req: AuthRequest, res: Response) {
    try {
      const { disputeId, resolution, notes } = req.body;
      const adminId = req.user?.id;
      
      if (!adminId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!disputeId) {
        return res.status(400).json({ error: "Dispute ID is required" });
      }

      const result = await DisputeService.resolve(disputeId, adminId, resolution, notes);
      res.json({ success: true, dispute: result });
    } catch (error: any) {
      console.error("Resolve dispute error:", error);
      res.status(500).json({ error: error.message || 'Failed to resolve dispute' });
    }
  }

  // ✅ NEW: Admin rejects a dispute
  static async reject(req: AuthRequest, res: Response) {
    try {
      const { disputeId, resolution, notes } = req.body;
      const adminId = req.user?.id;
      
      if (!adminId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!disputeId) {
        return res.status(400).json({ error: "Dispute ID is required" });
      }
      
      const result = await DisputeService.reject(disputeId, adminId, resolution, notes);
      res.json({ success: true, dispute: result });
    } catch (error: any) {
      console.error("Reject dispute error:", error);
      res.status(500).json({ error: error.message || 'Failed to reject dispute' });
    }
  }

  // ✅ NEW: Get all disputes (Admin)
  static async getAll(req: AuthRequest, res: Response) {
    try {
      const disputes = await DisputeService.getAll();
      
      // Get statistics
      const stats = {
        open: disputes.filter(d => d.status === 'open').length,
        resolved: disputes.filter(d => d.status === 'resolved').length,
        rejected: disputes.filter(d => d.status === 'rejected').length,
        total: disputes.length
      };
      
      res.json({ disputes, stats });
    } catch (error: any) {
      console.error("Get all disputes error:", error);
      res.status(500).json({ error: error.message || 'Failed to fetch disputes' });
    }
  }

  // ✅ NEW: Get dispute by ID
  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const dispute = await DisputeService.getById(id);
      
      if (!dispute) {
        return res.status(404).json({ error: "Dispute not found" });
      }
      
      res.json(dispute);
    } catch (error: any) {
      console.error("Get dispute by ID error:", error);
      res.status(500).json({ error: error.message || 'Failed to fetch dispute' });
    }
  }

  // ✅ NEW: Get disputes by order
  static async getByOrder(req: Request, res: Response) {
    try {
      const { orderId } = req.params;
      const disputes = await DisputeService.getByOrder(orderId);
      res.json(disputes);
    } catch (error: any) {
      console.error("Get disputes by order error:", error);
      res.status(500).json({ error: error.message || 'Failed to fetch disputes' });
    }
  }

  // ✅ NEW: Get dispute statistics
  static async getStats(req: Request, res: Response) {
    try {
      const stats = await DisputeService.getStats();
      res.json(stats);
    } catch (error: any) {
      console.error("Get dispute stats error:", error);
      res.status(500).json({ error: error.message || 'Failed to fetch statistics' });
    }
  }

  // ✅ NEW: Add note to dispute
  static async addNote(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { note } = req.body;
      const adminId = req.user?.id;
      
      if (!adminId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      if (!note || note.trim().length === 0) {
        return res.status(400).json({ error: "Note is required" });
      }

      const result = await DisputeService.addNote(id, adminId, note);
      res.json({ success: true, note: result });
    } catch (error: any) {
      console.error("Add dispute note error:", error);
      res.status(500).json({ error: error.message || 'Failed to add note' });
    }
  }
}