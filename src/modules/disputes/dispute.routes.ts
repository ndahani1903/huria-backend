import { Router } from 'express';
import { DisputeController } from './dispute.controller';
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";
import { 
  rateLimitMiddleware, 
  authRateLimiter, 
  paymentRateLimiter 
} from "../../middleware/rateLimit.middleware";

const router = Router();

// Customer creates a dispute
router.post('/', 
  authMiddleware, 
  requireRole("customer"),
  authRateLimiter,  // Prevent spam dispute creation
  DisputeController.create
);

// Admin resolves a dispute
router.post('/resolve', 
  authMiddleware, 
  requireRole("admin"),
  paymentRateLimiter,  //Strict limit 4 resolution (financial impact)
  DisputeController.resolve
);

// Admin rejects a dispute
router.post('/reject', 
  authMiddleware, 
  requireRole("admin"),
  paymentRateLimiter,  //Strict limit for rejection (financial impact)
  DisputeController.reject
);

/*
// Optional: Get dispute by ID
router.get('/:id', 
  authMiddleware, 
  rateLimitMiddleware,
  DisputeController.getById
);

// Optional: Get all disputes for user/order
router.get('/order/:orderId', 
  authMiddleware, 
  rateLimitMiddleware,
  DisputeController.getByOrder
);

*/

export default router;
