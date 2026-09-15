import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../config/db';
import { SMSService } from './sms.service';

export class OTPService {
  
  // Generate and send OTP for phone verification
  static async sendPhoneOTP(userId: string, phone: string) {
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Hash OTP before storing
    const hashedOTP = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    
    await prisma.user.update({
      where: { id: userId },
      data: {
        phoneOTP: hashedOTP,
        phoneOTPExpiresAt: expiresAt,
        phoneOTPAttempts: 0
      }
    });
    
    // Send SMS via Africa's Talking
    await SMSService.sendOTP(phone, otp);
    
    // Log for debugging (development only)
    console.log(`📱 OTP for ${phone}: ${otp}`);
    
    return { success: true, message: 'OTP sent successfully' };
  }
  
  // Verify phone OTP
  static async verifyPhoneOTP(userId: string, otp: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        phoneOTP: true,
        phoneOTPExpiresAt: true,
        phoneOTPAttempts: true,
        phoneVerified: true
      }
    });
    
    if (!user) throw new Error('User not found');
    if (user.phoneVerified) throw new Error('Phone already verified');
    if (!user.phoneOTP) throw new Error('No OTP request found');
    
    // Check if OTP expired
    if (user.phoneOTPExpiresAt && new Date() > user.phoneOTPExpiresAt) {
      throw new Error('OTP has expired. Please request a new one.');
    }
    
    // Check attempts (max 5)
    const attempts = user.phoneOTPAttempts || 0;
    if (attempts >= 5) {
      throw new Error('Too many failed attempts. Please request a new OTP.');
    }
    
    // Verify OTP
    const isValid = await bcrypt.compare(otp, user.phoneOTP);
    
    if (!isValid) {
      await prisma.user.update({
        where: { id: userId },
        data: { phoneOTPAttempts: attempts + 1 }
      });
      throw new Error('Invalid OTP. Please try again.');
    }
    
    // Mark phone as verified
    await prisma.user.update({
      where: { id: userId },
      data: {
        phoneVerified: true,
        phoneVerifiedAt: new Date(),
        phoneOTP: null,
        phoneOTPExpiresAt: null,
        phoneOTPAttempts: 0
      }
    });
    
    // Log activity
    await prisma.activityLog.create({
      data: {
        userId,
        action: 'Phone verified via OTP',
        device: 'mobile'
      }
    });
    
    return { success: true, message: 'Phone verified successfully' };
  }
  
  // Resend OTP
  static async resendOTP(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true, phoneVerified: true }
    });
    
    if (!user) throw new Error('User not found');
    if (user.phoneVerified) throw new Error('Phone already verified');
    if (!user.phone) throw new Error('No phone number found');
    
    return this.sendPhoneOTP(userId, user.phone);
  }
  
  // Check if phone needs verification
  static async needsVerification(userId: string): Promise<boolean> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phoneVerified: true }
    });
    return !user?.phoneVerified;
  }
}