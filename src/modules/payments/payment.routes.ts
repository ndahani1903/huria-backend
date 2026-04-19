import { Router } from 'express';
import { PaymentController } from './payment.controller';

const router = Router();

router.post('/stk', PaymentController.stkPush);
router.post('/callback', PaymentController.callback);
router.post('/release', PaymentController.release);
router.post('/refund', PaymentController.refund);
router.get('/:orderId', PaymentController.getPayment);

export default router;