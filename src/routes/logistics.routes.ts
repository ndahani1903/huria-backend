// src/routes/logistics.routes.ts

import { Router } from 'express';
import { LogisticsController } from '../controllers/logistics.controller';
import { AdminLogisticsController } from '../controllers/adminLogistics.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

const router = Router();

// Public/Protected endpoints
router.post('/evaluate', authMiddleware, LogisticsController.evaluateCart);

// Merchant endpoints
router.put('/products/:productId/logistics', 
  authMiddleware, 
  requireRole('merchant'), 
  LogisticsController.updateProductLogistics
);

router.get('/merchant/fbu-requests', 
  authMiddleware, 
  requireRole('merchant'), 
  LogisticsController.getMerchantFBURequests
);

router.post('/merchant/fbu-requests/:requestId/confirm-pickup', 
  authMiddleware, 
  requireRole('merchant'), 
  LogisticsController.confirmPickupSchedule
);

// Admin endpoints
router.get('/admin/fbu-requests', 
  authMiddleware, 
  requireRole('admin'), 
  AdminLogisticsController.getAllFBURequests
);

router.get('/admin/fbu-analytics', 
  authMiddleware, 
  requireRole('admin'), 
  AdminLogisticsController.getFBUAnalytics
);

router.patch('/admin/fbu-requests/:requestId', 
  authMiddleware, 
  requireRole('admin'), 
  AdminLogisticsController.updateFBURequestStatus
);

// Utility endpoint
router.get('/weight-bracket', LogisticsController.getWeightBracket);


export default router;