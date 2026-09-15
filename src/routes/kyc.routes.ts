//src/routes/kyc.routes.ts

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { KYCService } from '../services/kyc.service';
import { upload } from '../middleware/upload.middleware'; 

const router = Router();

// ============ DRIVER KYC ENDPOINTS ============

// Submit driver KYC
router.post('/driver/submit',
  authMiddleware,
  requireRole('driver'),
  upload.fields([
    { name: 'licenseCardImage', maxCount: 1 },
    { name: 'nidaCardImage', maxCount: 1 },
    { name: 'passportPhoto', maxCount: 1 },
    { name: 'selfieImage', maxCount: 1 }
  ]),
  async (req: any, res: any) => {
    try {
      const userId = req.user.id;
      const files = req.files || {};
      
      const data = {
        nidaNumber: req.body.nidaNumber,
        fullName: req.body.fullName,
        licenseNumber: req.body.licenseNumber,
        plateNumber: req.body.plateNumber,
        vehicleType: req.body.vehicleType,
        licenseCardImage: (files.licenseCardImage as any)?.[0]?.path,
        nidaCardImage: (files.nidaCardImage as any)?.[0]?.path,
        passportPhoto: (files.passportPhoto as any)?.[0]?.path,
        selfieImage: (files.selfieImage as any)?.[0]?.path
      };
      
      const result = await KYCService.submitDriverKYC(userId, data);
      res.json({ success: true, message: 'KYC submitted successfully', data: result });
    } catch (error: any) {
      console.error('Driver KYC submit error:', error);
      res.status(400).json({ error: error.message });
    }
  }
);

// Get driver KYC status
router.get('/driver/status',
  authMiddleware,
  requireRole('driver'),
  async (req: any, res: any) => {
    try {
      const userId = req.user.id; 
      const status = await KYCService.getKYCStatus(userId, 'DRIVER');
      res.json(status);
    } catch (error: any) {
      console.error('Get driver KYC status error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ============ MERCHANT KYC ENDPOINTS ============

// Submit merchant KYC
router.post('/merchant/submit',
  authMiddleware,
  requireRole('merchant'),
  upload.fields([
    { name: 'nidaCardImage', maxCount: 1 },
    { name: 'passportPhoto', maxCount: 1 },
    { name: 'selfieImage', maxCount: 1 },
    { name: 'businessLicenseImage', maxCount: 1 },
    { name: 'logoImage', maxCount: 1 }
  ]),
  async (req: any, res: any) => {
    try {
      const userId = req.user.id;
      const files = req.files || {};
      
      const data = {
        nidaNumber: req.body.nidaNumber,
        fullName: req.body.fullName,
        businessRegistrationNumber: req.body.businessRegistrationNumber,
        businessAddress: req.body.businessAddress,
        businessLat: req.body.businessLat ? parseFloat(req.body.businessLat) : undefined,
        businessLng: req.body.businessLng ? parseFloat(req.body.businessLng) : undefined,
        nidaCardImage: (files.nidaCardImage as any)?.[0]?.path,
        passportPhoto: (files.passportPhoto as any)?.[0]?.path,
        selfieImage: (files.selfieImage as any)?.[0]?.path,
        businessLicenseImage: (files.businessLicenseImage as any)?.[0]?.path,
        logoImage: (files.logoImage as any)?.[0]?.path
      };
      
      const result = await KYCService.submitMerchantKYC(userId, data);
      res.json({ success: true, message: 'KYC submitted successfully', data: result });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  }
);

// Get merchant KYC status
router.get('/merchant/status',
  authMiddleware,
  requireRole('merchant'),
  async (req: any, res: any) => {
    try {
      const userId = req.user.id;
      const status = await KYCService.getKYCStatus(userId, 'MERCHANT');
      res.json(status);
    } catch (error: any) {
      console.error('Get merchant KYC status error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// ============ ADMIN KYC MANAGEMENT ENDPOINTS ============

// Get all pending KYC submissions
router.get('/admin/pending',
  authMiddleware,
  requireRole('admin'),
  async (req: any, res: any) => {
    try {
      const pending = await KYCService.getPendingKYC();
      res.json(pending);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Approve KYC
router.post('/admin/approve/:userType/:userId',
  authMiddleware,
  requireRole('admin'),
  async (req: any, res: any) => {
    try {
      const { userType, userId } = req.params;
      const { notes } = req.body;
      const result = await KYCService.approveKYC(userId, userType, req.user.id, notes);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Reject KYC
router.post('/admin/reject/:userType/:userId',
  authMiddleware,
  requireRole('admin'),
  async (req: any, res: any) => {
    try {
      const { userType, userId } = req.params;
      const { reason } = req.body;
      if (!reason) {
        return res.status(400).json({ error: 'Rejection reason is required' });
      }
      const result = await KYCService.rejectKYC(userId, userType, req.user.id, reason);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Freeze user
router.post('/admin/freeze/:userType/:userId',
  authMiddleware,
  requireRole('admin'),
  async (req: any, res: any) => {
    try {
      const { userType, userId } = req.params;
      const { reason } = req.body;
      const result = await KYCService.freezeUser(userId, userType, req.user.id, reason || 'Admin action');
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Unfreeze user
router.post('/admin/unfreeze/:userType/:userId',
  authMiddleware,
  requireRole('admin'),
  async (req: any, res: any) => {
    try {
      const { userType, userId } = req.params;
      const { reason } = req.body;
      const result = await KYCService.unfreezeUser(userId, userType, req.user.id, reason);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Get KYC audit logs
router.get('/admin/audit-logs',
  authMiddleware,
  requireRole('admin'),
  async (req: any, res: any) => {
    try {
      const { userId, limit } = req.query;
      const logs = await KYCService.getKYCAuditLogs(userId as string, limit ? parseInt(limit as string) : 100);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Trigger cleanup job (manual)
router.post('/admin/cleanup-freeze',
  authMiddleware,
  requireRole('admin'),
  async (req: any, res: any) => {
    try {
      const result = await KYCService.freezeUnverifiedUsers();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Debug endpoint to check KYC data
router.get('/admin/debug',
  authMiddleware,
  requireRole('admin'),
  async (req: any, res: any) => {
    try {
      // Test each query separately
      const drivers = await prisma.driverKYC.findMany({
        where: { kycStatus: 'PENDING' },
        take: 5
      });
      
      const merchants = await prisma.merchantKYC.findMany({
        where: { kycStatus: 'PENDING' },
        take: 5
      });
      
      res.json({
        driversCount: drivers.length,
        merchantsCount: merchants.length,
        driversSample: drivers,
        merchantsSample: merchants
      });
    } catch (error: any) {
      console.error('Debug error:', error);
      res.status(500).json({ error: error.message, stack: error.stack });
    }
  }
);

export default router;