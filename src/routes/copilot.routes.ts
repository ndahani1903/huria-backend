import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import coPilotService from '../services/copilot.service';

const router = Router();

// Get next delivery for driver
router.get('/next-delivery',
  authMiddleware,
  requireRole('driver'),
  async (req: any, res) => {
    const delivery = await coPilotService.getNextDelivery(req.user.driverId);
    res.json(delivery || { message: 'No pending deliveries' });
  }
);

// Get route between two points
router.post('/route',
  authMiddleware,
  requireRole('driver'),
  async (req, res) => {
    const { origin, destination } = req.body;
    const route = await coPilotService.getRoute(origin, destination);
    res.json(route);
  }
);

// Update driver location
router.post('/location',
  authMiddleware,
  requireRole('driver'),
  async (req: any, res) => {
    const { lat, lng } = req.body;
    await coPilotService.updateLocation(req.user.driverId, lat, lng);
    res.json({ success: true });
  }
);

// Complete delivery with OTP
router.post('/complete-delivery',
  authMiddleware,
  requireRole('driver'),
  async (req: any, res) => {
    const { deliveryId, otp, photo } = req.body;
    const result = await coPilotService.completeDelivery(deliveryId, req.user.driverId, otp, photo);
    res.json(result);
  }
);

// Get voice commands list
router.get('/voice-commands',
  authMiddleware,
  requireRole('driver'),
  async (req, res) => {
    const commands = await coPilotService.getVoiceCommands();
    res.json({ commands });
  }
);

// Process voice command
router.post('/voice-command',
  authMiddleware,
  requireRole('driver'),
  async (req: any, res) => {
    const { command, deliveryId } = req.body;
    const result = await coPilotService.processVoiceCommand(command, req.user.driverId, deliveryId);
    res.json(result);
  }
);

export default router;