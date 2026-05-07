import crypto from 'crypto';
import { prisma } from '../config/db';

export interface SignatureData {
  userId: string;
  agreementType: 'merchant' | 'driver';
  agreementVersion: string;
  signature: string; // Base64 of signature canvas
  ipAddress: string;
  userAgent: string;
}

export class SignatureService {
  
  async storeSignature(data: SignatureData): Promise<any> {
    // Generate hash of agreement content (for verification)
    const agreementHash = crypto
      .createHash('sha256')
      .update(`${data.agreementType}-${data.agreementVersion}`)
      .digest('hex');
    
    // Store signature
    const signature = await prisma.agreementSignature.create({
      data: {
        id: crypto.randomUUID(),
        userId: data.userId,
        agreementType: data.agreementType,
        agreementVersion: data.agreementVersion,
        agreementHash,
        signatureData: data.signature,
        signedAt: new Date(),
        ipAddress: data.ipAddress,
        userAgent: data.userAgent
      }
    });
    
    // Send email copy
    await this.sendSignedCopy(data.userId, data.agreementType);
    
    return signature;
  }
  
  async getSignatureStatus(userId: string, agreementType: string): Promise<{
    signed: boolean;
    signedAt?: Date;
    version?: string;
  }> {
    const signature = await prisma.agreementSignature.findFirst({
      where: { userId, agreementType },
      orderBy: { signedAt: 'desc' }
    });
    
    if (signature) {
      return {
        signed: true,
        signedAt: signature.signedAt,
        version: signature.agreementVersion
      };
    }
    
    return { signed: false };
  }
  
  private async sendSignedCopy(userId: string, agreementType: string): Promise<void> {
    // Get user email
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true }
    });
    
    // In production, send email with attached PDF
    console.log(`📧 Sending signed ${agreementType} agreement to ${user?.email}`);
  }
}

export default new SignatureService();