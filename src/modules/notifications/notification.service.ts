import { prisma } from "../../config/db";
import { NotificationSettingsService } from "./notificationSettings.service";

export class NotificationService {
  /*static async sendSMS(phone: string, message: string) {
    console.log(`📩 SMS to ${phone}: ${message}`);

    // Later: integrate Twilio / Africa's Talking
  }

  static async sendOrderUpdate(phone: string, status: string) {
    const message = `Your order status is now: ${status}`;
    await this.sendSMS(phone, message);
  }
}*/

 static async sendPushNotification(userId: string, title: string, body: string, data?: any) {
    const canSend = await NotificationSettingsService.shouldSendNotification(userId, 'push');
    if (!canSend) return;

    // Get user's push tokens
    const pushTokens = await prisma.pushToken.findMany({
      where: { userId, active: true }
    });

 // Send to each token (implement with your push service - Firebase,etc.)
    for (const token of pushTokens) {
      try {
        // Example with web push
        await this.sendWebPush(token.token, title, body, data);
      } catch (error) {
        console.error("Failed to send push notification:", error);
      }
    }
  }

  static async sendEmailNotification(userId: string, subject: string, html: string) {
    const canSend = await NotificationSettingsService.shouldSendNotification(userId, 'email');
    if (!canSend) return;

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user?.email) return;

    // Implement with your email service (Nodemailer, SendGrid, etc.)
    await this.sendEmail(user.email, subject, html);
  }

  static async sendSMSNotification(userId: string, message: string) {
    const canSend = await NotificationSettingsService.shouldSendNotification(userId, 'sms');
    if (!canSend) return;

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user?.phone) return;

    // Implement with your SMS service (Twilio, Africa's Talking, etc.)
    await this.sendSMS(user.phone, message);
  }

  // Example: Send order confirmation notifications
  static async notifyOrderCreated(userId: string, orderId: string) {
    // Push notification
    await this.sendPushNotification(
      userId,
      "Order Confirmed 🎉",
      `Your order #${orderId} has been confirmed!`,
      { orderId, type: "order_confirmation" }
    );

    // Email notification
    await this.sendEmailNotification(
      userId,
      `Order Confirmed - #${orderId}`,
      `<h1>Thank you for your order!</h1><p>Order #${orderId} has been confirmed.</p>`
    );

    // SMS notification (only for critical updates)
    await this.sendSMSNotification(
      userId,
      `HURIA: Order #${orderId} confirmed. Track at: https://huria.app/track/${orderId}`
    );
  }

  // Private methods (implement with actual services)
  private static async sendWebPush(token: string, title: string, body: string, data?: any) {
    // Implement web push using web-push library
    console.log(`Sending push to ${token}: ${title} - ${body}`);
  }

  private static async sendEmail(to: string, subject: string, html: string) {
    // Implement email sending
    console.log(`Sending email to ${to}: ${subject}`);
  }

  private static async sendSMS(phone: string, message: string) {
    // Implement SMS sending
    console.log(`Sending SMS to ${phone}: ${message}`);
  }
}