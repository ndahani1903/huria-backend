import { Router } from 'express';
import { OrderController } from './order.controller';
import { authMiddleware } from "../../middleware/auth.middleware";
import { requireRole } from "../../middleware/role.middleware";

const router = Router();

router.post('/', authMiddleware, requireRole("customer"), OrderController.create);
router.post('/deliver', authMiddleware, requireRole("driver"), OrderController.deliver);
router.post('/complete', authMiddleware, requireRole("driver"), OrderController.complete);
router.get('/:orderId', authMiddleware, OrderController.get);
router.post('/assign', authMiddleware, requireRole("driver"), OrderController.assignDriver);
router.get("/:orderId/tracking", OrderController.tracking);
router.post("/checkout", authMiddleware, OrderController.checkout);

export default router;
