import { Router } from 'express';
import { AddressController } from '../controllers/address.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authMiddleware, AddressController.getAddresses);
router.post('/', authMiddleware, AddressController.addAddress);
router.put('/:addressId/default', authMiddleware, AddressController.setDefault);
router.delete('/:addressId', authMiddleware, AddressController.deleteAddress);
router.get('/search', authMiddleware, AddressController.searchAddress);

export default router;