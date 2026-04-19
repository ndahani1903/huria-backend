import { Router } from 'express';
import { DisputeController } from './dispute.controller';

const router = Router();

router.post('/', DisputeController.create);
router.post('/resolve', DisputeController.resolve);
router.post('/reject', DisputeController.reject);

export default router;
