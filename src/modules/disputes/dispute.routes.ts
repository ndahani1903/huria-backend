// src/modules/disputes/dispute.routes.ts

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
  authRateLimiter,
  DisputeController.create
);

// Admin resolves a dispute
router.post('/resolve', 
  authMiddleware, 
  requireRole("admin"),
  paymentRateLimiter,
  DisputeController.resolve
);

// Admin rejects a dispute
router.post('/reject', 
  authMiddleware, 
  requireRole("admin"),
  paymentRateLimiter,
  DisputeController.reject
);

// ✅ NEW: Get all disputes (Admin)
router.get('/', 
  authMiddleware, 
  requireRole("admin"),
  rateLimitMiddleware,
  DisputeController.getAll
);

// ✅ NEW: Get dispute statistics (Admin)
router.get('/stats', 
  authMiddleware, 
  requireRole("admin"),
  rateLimitMiddleware,
  DisputeController.getStats
);

// ✅ NEW: Get dispute by ID (Admin)
router.get('/:id', 
  authMiddleware, 
  requireRole("admin"),
  rateLimitMiddleware,
  DisputeController.getById
);

// ✅ NEW: Get disputes by order (Admin/Customer)
router.get('/order/:orderId', 
  authMiddleware, 
  rateLimitMiddleware,
  DisputeController.getByOrder
);

// ✅ NEW: Add note to dispute (Admin)
router.post('/:id/note', 
  authMiddleware, 
  requireRole("admin"),
  authRateLimiter,
  DisputeController.addNote
);

export default router;