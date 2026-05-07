import admin from 'firebase-admin';
import { prisma } from '../config/db';

// Initialize Firebase Admin
/*const serviceAccount = require('../config/firebase-service-account.json');*/

 // Firebase config from environment variables
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const messaging = admin.messaging();

export class PushNotificationService {
  // Save user's FCM token after they grant permission
  static async saveToken(userId: string, token: string, deviceType: string = 'web') {
    await prisma.pushToken.upsert({
      where: { token },
      update: { userId, active: true, lastUsed: new Date() },
      create: {
        userId,
        token,
        deviceType,
        active: true,
        lastUsed: new Date()
      }
    });
  }

   // Send real push notification
  static async sendRealPush(token: string, title: string, body: string, data?: any) {
    try {
      const message = {
        notification: { title, body },
        data: data || {},
        token,
      };
      
      const response = await messaging.send(message);
      console.log("✅ Push sent:", response);
      return { success: true, messageId: response };
    } catch (error: any) {
      console.error("❌ Push failed:", error);
      
      // If token is invalid, deactivate it
      if (error.code === 'messaging/registration-token-not-registered') {
        await prisma.pushToken.update({
          where: { token },
          data: { active: false },
        });
      }
      
      throw error;
    }
  }

  // Send to user
  static async sendToUser(userId: string, title: string, body: string, data?: any) {
    const tokens = await prisma.pushToken.findMany({
      where: { userId, active: true },
    });
    
    if (tokens.length === 0) {
      console.log("No active tokens for user:", userId);
      return { success: false, message: "No active tokens" };
    }
    
    const results = [];
    for (const token of tokens) {
      try {
        const result = await this.sendRealPush(token.token, title, body, data);
        results.push(result);
      } catch (error) {
        results.push({ success: false, error });
      }
    }
    
    return results;
  }

  // Test push notification
  static async sendTestPush(userId: string) {
    return this.sendToUser(
      userId,
      "🔧 HURIA Test Notification",
      "This is a REAL push notification! If you received this, your Firebase configuration is working correctly! ✅",
      { type: "test", timestamp: new Date().toISOString() }
    );
  }

  // Remove inactive token
  static async removeToken(token: string) {
    await prisma.pushToken.update({
      where: { token },
      data: { active: false }
    });
  }

  // Send to multiple users
  static async sendToUsers(userIds: string[], title: string, body: string, data?: any) {
    const tokens = await prisma.pushToken.findMany({
      where: { userId: { in: userIds }, active: true }
    });

    const messages = tokens.map(token => ({
      notification: { title, body },
      data: data || {},
      token: token.token,
    }));

    // Firebase has limit of 500 messages per batch
    const batchSize = 500;
    for (let i = 0; i < messages.length; i += batchSize) {
      const batch = messages.slice(i, i + batchSize);
      await Promise.allSettled(batch.map(msg => messaging.send(msg)));
    }
  }
}