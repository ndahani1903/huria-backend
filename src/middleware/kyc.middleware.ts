//src/middleware/kyc.middleware.ts

import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';
import { prisma } from '../config/db';
import { KYCStatus } from '@prisma/client';

export const requireKYCVerified = (userType: 'driver' | 'merchant') => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (userType === 'driver') {
        const driverId = req.user?.driverId;
        if (!driverId) {
          return res.status(401).json({ error: 'Driver not found' });
        }
        
        const driver = await prisma.driver.findUnique({
          where: { id: driverId },
          select: { kycStatus: true, frozenAt: true }
        });
        
        // Check if frozen
        if (driver?.frozenAt) {
          return res.status(403).json({ 
            error: 'ACCOUNT_FROZEN',
            message: 'Your account has been frozen. Please contact support to complete KYC verification.',
            supportContact: 'support@huria.co.tz'
          });
        }
        
        // Check if KYC is approved for sensitive operations
        const sensitiveOperations = ['/orders/accept', '/orders/complete', '/withdraw'];
        const isSensitive = sensitiveOperations.some(op => req.path.includes(op));
        
        if (isSensitive && driver?.kycStatus !== KYCStatus.APPROVED) {
          return res.status(403).json({
            error: 'KYC_REQUIRED',
            message: 'KYC verification required to perform this action. Please complete your KYC verification in Settings.',
            kycStatus: driver?.kycStatus
          });
        }
      } else if (userType === 'merchant') {
        const merchantId = req.user?.merchantId;
        if (!merchantId) {
          return res.status(401).json({ error: 'Merchant not found' });
        }
        
        const merchant = await prisma.merchant.findUnique({
          where: { id: merchantId },
          select: { kycStatus: true, frozenAt: true }
        });
        
        if (merchant?.frozenAt) {
          return res.status(403).json({
            error: 'ACCOUNT_FROZEN',
            message: 'Your store has been frozen. Please contact support to complete KYC verification.',
            supportContact: 'support@huria.co.tz'
          });
        }
        
        const sensitiveOperations = ['/orders/confirm', '/withdraw'];
        const isSensitive = sensitiveOperations.some(op => req.path.includes(op));
        
        if (isSensitive && merchant?.kycStatus !== KYCStatus.APPROVED) {
          return res.status(403).json({
            error: 'KYC_REQUIRED',
            message: 'KYC verification required to perform this action. Please complete your KYC verification in Settings.',
            kycStatus: merchant?.kycStatus
          });
        }
      }
      
      next();
    } catch (error) {
      console.error('KYC middleware error:', error);
      next();
    }
  };
};

// Check if user is frozen (for app startup)
export const checkFrozenStatus = async (userId: string, userType: 'driver' | 'merchant') => {
  if (userType === 'driver') {
    const driver = await prisma.driver.findUnique({
      where: { userId },
      select: { frozenAt: true, kycStatus: true }
    });
    
    if (driver?.frozenAt) {
      return { isFrozen: true, kycStatus: driver.kycStatus };
    }
  } else {
    const merchant = await prisma.merchant.findUnique({
      where: { userId },
      select: { frozenAt: true, kycStatus: true }
    });
    
    if (merchant?.frozenAt) {
      return { isFrozen: true, kycStatus: merchant.kycStatus };
    }
  }
  
  return { isFrozen: false };
};