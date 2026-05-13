import { Router } from 'express';
import signatureService from '../services/signature.service';
import { authMiddleware } from '../middleware/auth.middleware';
import { prisma } from "../config/db";
import { requireRole } from '../middleware/role.middleware';

const router = Router();

// Store signature (authenticated)
router.post('/store', authMiddleware, async (req, res) => {
  try {
    const signature = await signatureService.storeSignature({
      ...req.body,
      userId: req.user.id // Ensure user ID matches authenticated user
    });
    res.json({ success: true, signature });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Check signature status
router.get('/status/:userId/:agreementType', authMiddleware, async (req, res) => {
  try {
   const userId = String(req.params.userId);
   const agreementType = String(req.params.agreementType);

    const status = await signatureService.getSignatureStatus(
      userId,
      agreementType
    );
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get signature history for user
router.get('/history/:userId', authMiddleware, async (req, res) => {
  try {
   const userId = String(req.params.userId);

    const signatures = await prisma.agreementSignature.findMany({
      where: { userId },
      orderBy: { signedAt: 'desc' }
    });
    res.json(signatures);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/admin/all', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const signatures = await prisma.agreementSignature.findMany({
      include: {
        user: {
          select: { 
            id: true,
            name: true, 
            email: true, 
            phone: true, 
            role: true,
            createdAt: true
          }
        }
      },
      orderBy: { signedAt: 'desc' }
    });
    
    res.json({
      success: true,
      count: signatures.length,
      signatures
    });
  } catch (error) {
    console.error('Error fetching signatures:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch signatures' 
    });
  }
});

// Get single signature by ID - Admin only
router.get('/admin/:signatureId', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const signatureId = String(req.params.signatureId);

    const signature = await prisma.agreementSignature.findUnique({
      where: { id: signatureId },
      include: {
        user: {
          select: { name: true, email: true, phone: true, role: true }
        }
      }
    });
    
    if (!signature) {
      return res.status(404).json({ error: 'Signature not found' });
    }
    
    res.json({ success: true, signature });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch signature' });
  }
});

// Get signatures for a specific user - Admin only
router.get('/admin/user/:userId', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
   const userId = String(req.params.userId);

    const signatures = await prisma.agreementSignature.findMany({
      where: { userId },
      include: {
        user: {
          select: { name: true, email: true, phone: true, role: true }
        }
      },
      orderBy: { signedAt: 'desc' }
    });
    
    res.json({ success: true, signatures });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user signatures' });
  }
});

export default router;