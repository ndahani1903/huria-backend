//src/services/kyc.service.ts

import { prisma } from '../config/db';
import { KYCStatus } from '@prisma/client';
import { SMSService } from './sms.service';

export class KYCService {
  
  // ============ DRIVER KYC ============
  
  static async submitDriverKYC(
    userId: string,
    data: {
      nidaNumber?: string;
      fullName?: string;
      licenseNumber?: string;
      plateNumber?: string;
      vehicleType?: string;
      licenseCardImage?: string;
      nidaCardImage?: string;
      passportPhoto?: string;
      selfieImage?: string;
    }
  ) {
    // Find driver by userId instead of driverId
  const driver = await prisma.driver.findUnique({
    where: { userId: userId }  // ✅ Use userId to find driver
  });

  if (!driver) {
    throw new Error('Driver not found for this user');
  }

  const driverId = driver.id;  // Get the actual driver ID


    // Validate Tanzanian plate number format (e.g., T 734 EAB, T 123 ABC)
    if (data.plateNumber) {
      const plateRegex = /^[T]\s?\d{3}\s?[A-Z]{3}$/i;
      if (!plateRegex.test(data.plateNumber.trim())) {
        throw new Error('Invalid plate number format. Expected format: T 734 EAB');
      }
      data.plateNumber = data.plateNumber.toUpperCase();
    }
    
    // Validate license number (at least 5 characters)
    if (data.licenseNumber && data.licenseNumber.length < 5) {
      throw new Error('License number must be at least 5 characters');
    }
    
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    
    let kycStatus = KYCStatus.PENDING;
    
    // If user has been using app for 10+ days, mark as urgent pending
    const driverRecord = await prisma.driver.findUnique({
      where: { id: driverId },
      select: { createdAt: true, frozenAt: true }
    });
    
    if (driverRecord && driverRecord.createdAt < tenDaysAgo && !driverRecord.frozenAt) {
      // User has been using app for 10 days without verification
      kycStatus = KYCStatus.PENDING;
    }

    // Check if already verified
    const existingKYC = await prisma.driverKYC.findUnique({
      where: { driverId }
    });
    
   const currentAttempts = existingKYC?.verificationAttempts || 0;

    const kycData = {
      driverId,
      nidaNumber: data.nidaNumber,
      fullName: data.fullName,
      licenseNumber: data.licenseNumber,
      plateNumber: data.plateNumber,
      vehicleType: data.vehicleType,
      licenseCardImage: data.licenseCardImage,
      nidaCardImage: data.nidaCardImage,
      passportPhoto: data.passportPhoto,
      selfieImage: data.selfieImage,
      kycStatus,
      submittedAt: now,
      lastVerificationRequest: now
    };
    
    const result = await prisma.driverKYC.upsert({
    where: { driverId },
    update: {
      ...kycData,
      verificationAttempts: currentAttempts + 1,
      updatedAt: now
    },
    create: {
      ...kycData,
      verificationAttempts: 1,
      createdAt: now,
      updatedAt: now
    }
  });
    
    // Update driver's kycStatus
    await prisma.driver.update({
      where: { id: driverId },
      data: { 
        kycStatus,
        kycSubmittedAt: now
      }
    });
    
    // Log audit
    await prisma.kYCAuditLog.create({
      data: {
        userId: driverId,
        userType: 'DRIVER',
        action: 'SUBMIT',
        status: kycStatus,
        metadata: { hasNida: !!data.nidaNumber, hasLicense: !!data.licenseCardImage }
      }
    });
    
    // Notify admin
    const { io } = await import('../server');
    io.emit('admin:kyc-submitted', {
      userId: driverId,
      userType: 'DRIVER',
      name: data.fullName,
      submittedAt: now
    });
    
    return result;
  }
  
  // ============ MERCHANT KYC ============
  
  static async submitMerchantKYC(
    userId: string,
    data: {
      nidaNumber?: string;
      fullName?: string;
      businessRegistrationNumber?: string;
      businessAddress?: string;
      businessLat?: number;
      businessLng?: number;
      nidaCardImage?: string;
      passportPhoto?: string;
      selfieImage?: string;
      businessLicenseImage?: string;
      logoImage?: string;
    }
  ) {

     // Find merchant by userId instead of merchantId
  const merchant = await prisma.merchant.findUnique({
    where: { userId: userId }  // ✅ Use userId to find merchant
  });

  if (!merchant) {
    throw new Error('Merchant not found for this user');
  }

  const merchantId = merchant.id;

    // Validate NIDA number format (Tanzania format: 10-12 digits)
    if (data.nidaNumber) {
      const nidaRegex = /^\d{10,12}$/;
      if (!nidaRegex.test(data.nidaNumber)) {
        throw new Error('Invalid NIDA number format. Must be 10-12 digits');
      }
    }
    
    const now = new Date();
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    
    let kycStatus = KYCStatus.PENDING;
    
    const merchantRecord = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { createdAt: true, frozenAt: true }
    });
    
    if (merchantRecord && merchantRecord.createdAt < tenDaysAgo && !merchantRecord.frozenAt) {
      kycStatus = KYCStatus.PENDING;
    }
    
   // First, get current record to increment attempts
const existingKYC = await prisma.merchantKYC.findUnique({
  where: { merchantId }
});

const currentAttempts = existingKYC?.verificationAttempts || 0;

    const kycData = {
      merchantId,
      nidaNumber: data.nidaNumber,
      fullName: data.fullName,
      businessRegistrationNumber: data.businessRegistrationNumber,
      businessAddress: data.businessAddress,
      businessLat: data.businessLat,
      businessLng: data.businessLng,
      nidaCardImage: data.nidaCardImage,
      passportPhoto: data.passportPhoto,
      selfieImage: data.selfieImage,
      businessLicenseImage: data.businessLicenseImage,
      logoImage: data.logoImage,
      kycStatus,
      submittedAt: now,
      lastVerificationRequest: now
    };
    
    const result = await prisma.merchantKYC.upsert({
    where: { merchantId },
    update: {
      ...kycData,
      verificationAttempts: currentAttempts + 1,
      updatedAt: now
    },
    create: {
      ...kycData,
      verificationAttempts: 1,
      createdAt: now,
      updatedAt: now
    }
  });
    
    // Update merchant's kycStatus
    await prisma.merchant.update({
      where: { id: merchantId },
      data: { 
        kycStatus,
        kycSubmittedAt: now
      }
    });
    
    // Log audit
    await prisma.kYCAuditLog.create({
      data: {
        userId: merchantId,
        userType: 'MERCHANT',
        action: 'SUBMIT',
        status: kycStatus,
        metadata: { hasNida: !!data.nidaNumber, hasBusinessLicense: !!data.businessLicenseImage }
      }
    });
    
    // Notify admin
    const { io } = await import('../server');
    io.emit('admin:kyc-submitted', {
      userId: merchantId,
      userType: 'MERCHANT',
      name: data.fullName,
      businessName: data.businessRegistrationNumber,
      submittedAt: now
    });
    
    return result;
  }
  
  // ============ ADMIN VERIFICATION ============
  
  static async approveKYC(
    userId: string,
    userType: 'DRIVER' | 'MERCHANT',
    adminId: string,
    notes?: string
  ) {
    const now = new Date();
    
    if (userType === 'DRIVER') {
      await prisma.driverKYC.update({
        where: { driverId: userId },
        data: {
          kycStatus: KYCStatus.APPROVED,
          verifiedBy: adminId,
          verifiedAt: now,
          notes
        }
      });
      
      await prisma.driver.update({
        where: { id: userId },
        data: {
          kycStatus: KYCStatus.APPROVED,
          kycVerifiedAt: now,
          kycVerifiedBy: adminId,
          frozenAt: null
        }
      });
      
      // Send SMS notification
      const driver = await prisma.driver.findUnique({
        where: { id: userId },
        include: { user: true }
      });
      
      if (driver?.user?.phone) {
        await SMSService.sendRealSMS(
          driver.user.phone,
          `✅ Your KYC verification has been APPROVED! You can now use all features of HURIA Delivery. Thank you for your cooperation.`
        );
      }
    } else {
      await prisma.merchantKYC.update({
        where: { merchantId: userId },
        data: {
          kycStatus: KYCStatus.APPROVED,
          verifiedBy: adminId,
          verifiedAt: now,
          notes
        }
      });
      
      await prisma.merchant.update({
        where: { id: userId },
        data: {
          kycStatus: KYCStatus.APPROVED,
          kycVerifiedAt: now,
          kycVerifiedBy: adminId,
          frozenAt: null
        }
      });
      
      // Send SMS notification
      const merchant = await prisma.merchant.findUnique({
        where: { id: userId },
        include: { user: true }
      });
      
      if (merchant?.user?.phone) {
        await SMSService.sendRealSMS(
          merchant.user.phone,
          `✅ Your KYC verification has been APPROVED! Your store is now fully verified. Start accepting orders!`
        );
      }
    }
    
    // Log audit
    await prisma.kYCAuditLog.create({
      data: {
        userId,
        userType,
        action: 'APPROVE',
        status: KYCStatus.APPROVED,
        adminId,
        reason: notes
      }
    });
    
    const { io } = await import('../server');
    io.emit('admin:kyc-approved', { userId, userType, approvedAt: now });
    
    return { success: true, message: 'KYC approved successfully' };
  }
  
  static async rejectKYC(
    userId: string,
    userType: 'DRIVER' | 'MERCHANT',
    adminId: string,
    reason: string
  ) {
    if (!reason) {
      throw new Error('Rejection reason is required');
    }
    
    if (userType === 'DRIVER') {
      await prisma.driverKYC.update({
        where: { driverId: userId },
        data: {
          kycStatus: KYCStatus.REJECTED,
          rejectionReason: reason,
          verifiedBy: adminId,
          verifiedAt: new Date()
        }
      });
      
      await prisma.driver.update({
        where: { id: userId },
        data: { kycStatus: KYCStatus.REJECTED }
      });
    } else {
      await prisma.merchantKYC.update({
        where: { merchantId: userId },
        data: {
          kycStatus: KYCStatus.REJECTED,
          rejectionReason: reason,
          verifiedBy: adminId,
          verifiedAt: new Date()
        }
      });
      
      await prisma.merchant.update({
        where: { id: userId },
        data: { kycStatus: KYCStatus.REJECTED }
      });
    }
    
    // Log audit
    await prisma.kYCAuditLog.create({
      data: {
        userId,
        userType,
        action: 'REJECT',
        status: KYCStatus.REJECTED,
        adminId,
        reason
      }
    });
    
    const { io } = await import('../server');
    io.emit('admin:kyc-rejected', { userId, userType, reason });
    
    return { success: true, message: 'KYC rejected' };
  }
  
  // ============ FREEZE/UNFREEZE USERS ============
  
  static async freezeUser(
    userId: string,
    userType: 'DRIVER' | 'MERCHANT',
    adminId: string,
    reason: string
  ) {
    const now = new Date();
    
    if (userType === 'DRIVER') {
      await prisma.driver.update({
        where: { id: userId },
        data: { 
          frozenAt: now,
          kycStatus: KYCStatus.FROZEN
        }
      });
      
      await prisma.frozenUser.upsert({
        where: { userId },
        update: { frozenAt: now, reason },
        create: { userId, userType, frozenAt: now, reason }
      });
    } else {
      await prisma.merchant.update({
        where: { id: userId },
        data: { 
          frozenAt: now,
          kycStatus: KYCStatus.FROZEN
        }
      });
      
      await prisma.frozenUser.upsert({
        where: { userId },
        update: { frozenAt: now, reason },
        create: { userId, userType, frozenAt: now, reason }
      });
    }
    
    await prisma.kYCAuditLog.create({
      data: {
        userId,
        userType,
        action: 'FREEZE',
        status: KYCStatus.FROZEN,
        adminId,
        reason
      }
    });
    
    const { io } = await import('../server');
    io.emit('user:account-frozen', { userId, userType, reason });
    
    return { success: true };
  }
  
  static async unfreezeUser(
    userId: string,
    userType: 'DRIVER' | 'MERCHANT',
    adminId: string,
    reason?: string
  ) {
    if (userType === 'DRIVER') {
      await prisma.driver.update({
        where: { id: userId },
        data: { 
          frozenAt: null,
          kycStatus: KYCStatus.PENDING
        }
      });
      
      await prisma.frozenUser.deleteMany({
        where: { userId }
      });
    } else {
      await prisma.merchant.update({
        where: { id: userId },
        data: { 
          frozenAt: null,
          kycStatus: KYCStatus.PENDING
        }
      });
      
      await prisma.frozenUser.deleteMany({
        where: { userId }
      });
    }
    
    await prisma.kYCAuditLog.create({
      data: {
        userId,
        userType,
        action: 'UNFREEZE',
        status: KYCStatus.PENDING,
        adminId,
        reason
      }
    });
    
    const { io } = await import('../server');
    io.emit('user:account-unfrozen', { userId, userType });
    
    return { success: true };
  }
  
  // ============ CLEANUP JOB (Run daily via cron) ============
  
  static async freezeUnverifiedUsers() {
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    
    // Find drivers who have been using app for 10+ days without verification
    const unverifiedDrivers = await prisma.driver.findMany({
      where: {
        kycStatus: { in: [KYCStatus.NOT_SUBMITTED, KYCStatus.PENDING] },
        frozenAt: null,
        createdAt: { lt: tenDaysAgo }
      },
      include: { user: true }
    });
    
    // Find merchants who have been using app for 10+ days without verification
    const unverifiedMerchants = await prisma.merchant.findMany({
      where: {
        kycStatus: { in: [KYCStatus.NOT_SUBMITTED, KYCStatus.PENDING] },
        frozenAt: null,
        createdAt: { lt: tenDaysAgo }
      },
      include: { user: true }
    });
    
    let frozenCount = 0;
    
    for (const driver of unverifiedDrivers) {
      await this.freezeUser(driver.id, 'DRIVER', 'system', 'Auto-frozen: KYC not completed within 10 days');
      frozenCount++;
      
      // Send SMS notification
      if (driver.user?.phone) {
        await SMSService.sendRealSMS(
          driver.user.phone,
          `⚠️ Your account has been temporarily frozen because KYC verification was not completed within 10 days. Please contact support to verify your account and restore access.`
        );
      }
    }
    
    for (const merchant of unverifiedMerchants) {
      await this.freezeUser(merchant.id, 'MERCHANT', 'system', 'Auto-frozen: KYC not completed within 10 days');
      frozenCount++;
      
      if (merchant.user?.phone) {
        await SMSService.sendRealSMS(
          merchant.user.phone,
          `⚠️ Your merchant account has been temporarily frozen because KYC verification was not completed within 10 days. Please contact support to verify your account and restore access.`
        );
      }
    }
    
    console.log(`❄️ Auto-frozen ${frozenCount} unverified users (10+ days without KYC)`);
    
    const { io } = await import('../server');
    io.emit('admin:kyc-auto-frozen', { count: frozenCount, timestamp: new Date() });
    
    return { frozenCount, drivers: unverifiedDrivers.length, merchants: unverifiedMerchants.length };
  }
  
  // ============ GET KYC STATUS ============
  
  static async getKYCStatus(userId: string, userType: 'DRIVER' | 'MERCHANT') {
    if (userType === 'DRIVER') {
      const driver = await prisma.driver.findUnique({
         where: { userId: userId },
        include: { kyc: true, user: true }
      });
      
     if (!driver) {
      return {
        kycStatus: KYCStatus.NOT_SUBMITTED,
        isFrozen: false,
        frozenAt: null,
        submittedAt: null,
        verifiedAt: null,
        rejectionReason: null
      };
    }
    
    return {
      kycStatus: driver.kycStatus || KYCStatus.NOT_SUBMITTED,
      isFrozen: !!driver.frozenAt,
      frozenAt: driver.frozenAt,
      submittedAt: driver.kyc?.submittedAt,
      verifiedAt: driver.kycVerifiedAt,
      rejectionReason: driver.kyc?.rejectionReason,
      // Add driver specific info
      driverId: driver.id,
      name: driver.user?.name,
      phone: driver.user?.phone,
      email: driver.user?.email
     };
    } else {
      const merchant = await prisma.merchant.findUnique({
        where: { userId: userId },
        include: { kyc: true, user: true }
      });
      
      if (!merchant) {
      return {
        kycStatus: KYCStatus.NOT_SUBMITTED,
        isFrozen: false,
        frozenAt: null,
        submittedAt: null,
        verifiedAt: null,
        rejectionReason: null
      };
    }
    
    return {
      kycStatus: merchant.kycStatus || KYCStatus.NOT_SUBMITTED,
      isFrozen: !!merchant.frozenAt,
      frozenAt: merchant.frozenAt,
      submittedAt: merchant.kyc?.submittedAt,
      verifiedAt: merchant.kycVerifiedAt,
      rejectionReason: merchant.kyc?.rejectionReason,
      // Add merchant specific info
      merchantId: merchant.id,
      name: merchant.user?.name,
      businessName: merchant.businessName,
      phone: merchant.user?.phone,
      email: merchant.user?.email
    };
  }
}
  
  // ============ ADMIN GET PENDING KYC ============
  
  static async getPendingKYC() {
    const pendingDrivers = await prisma.driverKYC.findMany({
      where: { kycStatus: KYCStatus.PENDING },
      include: {
        driver: {
          include: { user: { select: { name: true, email: true, phone: true } } }
        }
      },
      orderBy: { submittedAt: 'asc' }
    });
    
    const pendingMerchants = await prisma.merchantKYC.findMany({
      where: { kycStatus: KYCStatus.PENDING },
      include: {
        merchant: {
          include: { user: { select: { name: true, email: true, phone: true } } }
        }
      },
      orderBy: { submittedAt: 'asc' }
    });
    
    const rejectedDrivers = await prisma.driverKYC.findMany({
      where: { kycStatus: KYCStatus.REJECTED },
      include: {
        driver: {
          include: { user: { select: { name: true, email: true, phone: true } } }
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: 50
    });
    
    const rejectedMerchants = await prisma.merchantKYC.findMany({
      where: { kycStatus: KYCStatus.REJECTED },
      include: {
        merchant: {
          include: { user: { select: { name: true, email: true, phone: true } } }
        }
      },
      orderBy: { updatedAt: 'desc' },
      take: 50
    });
    
    // Get frozen users - using raw query or findMany with proper includes
 // Get frozen users - simpler approach without relations
let frozenUsers: any[] = [];
try {
  const frozenRecords = await prisma.frozenUser.findMany({
    orderBy: { frozenAt: 'desc' }
  });
  
  // Manually fetch user details for each frozen record
  for (const record of frozenRecords) {
    let userDetails = null;
    if (record.userType === 'DRIVER') {
      const driver = await prisma.driver.findUnique({
        where: { id: record.userId },
        include: { user: { select: { name: true, email: true, phone: true } } }
      });
      if (driver) {
        userDetails = {
          name: driver.user?.name,
          phone: driver.user?.phone,
          email: driver.user?.email
        };
      }
    } else if (record.userType === 'MERCHANT') {
      const merchant = await prisma.merchant.findUnique({
        where: { id: record.userId },
        include: { user: { select: { name: true, email: true, phone: true } } }
      });
      if (merchant) {
        userDetails = {
          name: merchant.user?.name,
          phone: merchant.user?.phone,
          email: merchant.user?.email,
          businessName: merchant.businessName
        };
      }
    }
    
    frozenUsers.push({
      userId: record.userId,
      userType: record.userType,
      name: userDetails?.name,
      businessName: userDetails?.businessName,
      phone: userDetails?.phone,
      frozenAt: record.frozenAt,
      reason: record.reason
    });
  }
} catch (error) {
  console.warn('Could not fetch frozen users:', error);
  frozenUsers = [];
}

   // Format pending drivers
  const formattedPendingDrivers = pendingDrivers.map(d => ({
    id: d.driverId,
    name: d.fullName || d.driver?.user?.name,
    phone: d.driver?.user?.phone || 'No phone',
    email: d.driver?.user?.email || 'No email',

    // Personal Information
    nidaNumber: d.nidaNumber,
    fullName: d.fullName || 'Not provided',

    // Driver & Vehicle Information
    licenseNumber: d.licenseNumber,
    plateNumber: d.plateNumber,
    vehicleType: d.vehicleType || 'Not provided',
  
    // Document flags
    hasLicenseImage: !!d.licenseCardImage,
    hasSelfie: !!d.selfieImage,
    hasNidaImage: !!d.nidaCardImage,
    hasPassportPhoto: !!d.passportPhoto,
  
    // Document URLs
    licenseCardImage: d.licenseCardImage,
    selfieImage: d.selfieImage,
    nidaCardImage: d.nidaCardImage,
    passportPhoto: d.passportPhoto,
  
    // Metadata
    submittedAt: d.submittedAt,
    daysPending: Math.floor((Date.now() - new Date(d.submittedAt).getTime()) / (24 * 60 * 60 * 1000)),
  verificationAttempts: d.verificationAttempts
}));
  
  // Format pending merchants
  const formattedPendingMerchants = pendingMerchants.map(m => ({
    id: m.merchantId,
    name: m.fullName || m.merchant?.user?.name,
    businessName: m.merchant?.businessName || m.merchant?.name,
    phone: m.merchant?.user?.phone || 'No phone',
    email: m.merchant?.user?.email || 'No email',

   // Personal Information
    nidaNumber: m.nidaNumber,
    fullName: m.fullName || 'Not provided',

   // Business Information
    businessRegistrationNumber: m.businessRegistrationNumber || 'Not provided',
  businessAddress: m.businessAddress || 'Not provided',
  businessLat: m.businessLat,
  businessLng: m.businessLng,

   // Document flags
    hasNidaImage: !!m.nidaCardImage,
    hasBusinessLicense: !!m.businessLicenseImage,
    hasSelfie: !!m.selfieImage,
    hasLogo: !!m.logoImage,

    // Document URLs
    nidaCardImage: m.nidaCardImage,
    businessLicenseImage: m.businessLicenseImage,
    selfieImage: m.selfieImage,
    logoImage: m.logoImage,

   // Metadata
    submittedAt: m.submittedAt,
    daysPending: Math.floor((Date.now() - new Date(m.submittedAt).getTime()) / (24 * 60 * 60 * 1000)),
  verificationAttempts: m.verificationAttempts
}));
  
  // Format rejected drivers
  const formattedRejectedDrivers = rejectedDrivers.map(d => ({
    id: d.driverId,
    name: d.driver?.user?.name || 'Unknown',
    phone: d.driver?.user?.phone || 'No phone',
    rejectionReason: d.rejectionReason,
    rejectedAt: d.verifiedAt
  }));
  
  // Format rejected merchants
  const formattedRejectedMerchants = rejectedMerchants.map(m => ({
    id: m.merchantId,
    name: m.fullName || m.merchant?.user?.name,
    businessName: m.merchant?.businessName || m.merchant?.name,
    phone: m.merchant?.user?.phone || 'No phone',
    rejectionReason: m.rejectionReason,
    rejectedAt: m.verifiedAt
  }));
  
  // Format frozen users
  const formattedFrozenUsers = frozenUsers.map(f => ({
    userId: f.userId,
    userType: f.userType,
    name: f.driver?.user?.name || f.merchant?.user?.name,
    businessName: f.merchant?.businessName,
    phone: f.driver?.user?.phone || f.merchant?.user?.phone,
    frozenAt: f.frozenAt,
    reason: f.reason
  }));
    
     return {
    pending: {
      drivers: formattedPendingDrivers,
      merchants: formattedPendingMerchants
    },
    rejected: {
      drivers: formattedRejectedDrivers,
      merchants: formattedRejectedMerchants
    },
    frozen: formattedFrozenUsers,
    stats: {
      pendingDrivers: pendingDrivers.length,
      pendingMerchants: pendingMerchants.length,
      rejectedDrivers: rejectedDrivers.length,
      rejectedMerchants: rejectedMerchants.length,
      frozenUsers: frozenUsers.length
    }
  };
}
  
  // ============ GET KYC AUDIT LOGS ============
  
  static async getKYCAuditLogs(userId?: string, limit: number = 100) {
    const where: any = {};
    if (userId) {
      where.userId = userId;
    }
    
    return prisma.kYCAuditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit
    });
  }
}