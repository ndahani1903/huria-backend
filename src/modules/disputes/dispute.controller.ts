import { Request, Response } from 'express';
import { DisputeService } from './dispute.service';

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

  static async resolve(req: Request, res: Response) {
    try {
      const { disputeId } = req.body;

      const result = await DisputeService.resolve(disputeId);

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Resolve failed' });
    }
  }

  static async reject(req: Request, res: Response) {
    try {
      const { disputeId } = req.body;

      const result = await DisputeService.reject(disputeId);

      res.json(result);
    } catch (error) {
      res.status(500).json({ error: 'Reject failed' });
    }
  }
}
