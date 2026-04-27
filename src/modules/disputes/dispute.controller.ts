import { Request, Response } from 'express';
import { DisputeService } from './dispute.service';
import { AuthRequest } from '../../middleware/auth.middleware';

export class DisputeController {
  static async create(req: Request, res: Response) {
    try {
      const { orderId, reason } = req.body;
      const dispute = await DisputeService.create(orderId, reason);
      res.json(dispute);
    } catch (error) {
      res.status(500).json({ error: 'Dispute failed' });
    }
  }

  static async resolve(req: AuthRequest, res: Response) {
    try {
      const { disputeId } = req.body;
      const adminId = req.user?.id;
      
      if (!adminId) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const result = await DisputeService.resolve(disputeId, adminId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Resolve failed' });
    } 
  }

  static async reject(req: AuthRequest, res: Response) {
    try {
      const { disputeId } = req.body;
      const adminId = req.user?.id;
      
      if (!adminId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const result = await DisputeService.reject(disputeId, adminId);
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Reject failed' });
    }
  }
}
