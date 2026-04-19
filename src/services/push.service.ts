import * as admin from 'firebase-admin';
import { prisma } from '../config/db';

// Initialize Firebase Admin
if (!admin.apps.length) {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
    ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    : null;
  
  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("✅ Firebase Push initialized");
  } else {
    console.log("⚠️ Firebase not configured");
  }
}

export class PushService {
  
  // Store FCM token for user
  static async registerToken(userId: string, token: string, deviceType: string) {
    await prisma.pushToken.upsert({
      where: { token },
      update: { userId, deviceType, lastUsed: new Date() },
      create: { userId, token, deviceType },
    });
  }
  
  // Send push to specific user
  static async sendToUser(userId: string, title: string, body: string, data?: any) {
    const tokens = await prisma.pushToken.findMany({
      where: { userId, active: true },
    });
    
    const messages = tokens.map(t => ({
      token: t.token,
      notification: { title, body },
      data: data || {},
      android: { priority: 'high' as const },
      apns: { headers: { 'apns-priority': '10' } },
    }));
    
    const results = await Promise.allSettled(
      messages.map(m => admin.messaging().send(m))
    );
    
    return { success: results.filter(r => r.status === 'fulfilled').length };
  }
  
  // Send to all drivers
  static async sendToAllDrivers(title: string, body: string, data?: any) {
    const drivers = await prisma.user.findMany({
      where: { role: 'driver' },
      include: { pushTokens: true },
    });
    
    for (const driver of drivers) {
      await this.sendToUser(driver.id, title, body, data);
    }
  }
  
  // Template pushes
  static async newOrderForDriver(driverId: string, orderId: string, amount: number) {
    await this.sendToUser(driverId, '🆕 New Order Available', `Order #${orderId} | Amount: TZS ${amount}`, {
      type: 'new_order',
      orderId,
      screen: 'Orders',
    });
  }
  
  static async orderStatusUpdate(userId: string, orderId: string, status: string) {
    const statusMessages = {
      paid: 'Payment received! Finding a driver...',
      assigned: 'Driver assigned! Tracking available.',
      delivered: 'Order delivered! Please provide OTP.',
      completed: 'Order completed! Thank you!',
    };
    
    await this.sendToUser(userId, `Order #${orderId}`, statusMessages[status] || status, {
      type: 'order_update',
      orderId,
      status,
      screen: 'OrderDetails',
    });
  }
}