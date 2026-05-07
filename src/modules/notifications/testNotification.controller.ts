import { Request, Response } from "express";
import { prisma } from '../../config/db';
import { PushNotificationService } from "../../services/pushNotification.service";
import { EmailService } from "../../services/email.service";
import { SMSService } from "../../services/sms.service";
import { NotificationService } from "../../services/notification.service";
import { AuthRequest } from "../../middleware/auth.middleware";

export class TestNotificationController {
  // Test push notification
  static async testPush(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      await PushNotificationService.sendToUser(
        req.user.id,
        "Test Push Notification",
        "This is a test notification from HURIA! 🎉",
        { type: "test", timestamp: new Date().toISOString() }
      );

      res.json({ success: true, message: "Push notification sent!" });
    } catch (error: any) {
      console.error("Test push error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  // Test email notification
  static async testEmail(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id }
      });

      if (!user?.email) {
        return res.status(400).json({ error: "No email found for user" });
      }

      await EmailService.sendOrderConfirmation(user.email, {
        orderId: "TEST-001",
        customerName: user.name,
        items: [
          { name: "Test Product", quantity: 2, price: 50000 }
        ],
        total: 100000
      });

      res.json({ success: true, message: "Email sent!" });
    } catch (error: any) {
      console.error("Test email error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  // Test SMS notification
  static async testSMS(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id }
      });

      if (!user?.phone) {
        return res.status(400).json({ error: "No phone number found for user" });
      }

      await SMSService.sendOrderConfirmation(user.phone, "TEST-001");

      res.json({ success: true, message: "SMS sent!" });
    } catch (error: any) {
      console.error("Test SMS error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  // Test all notifications at once
  static async testAll(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id }
      });

      // Test push
      await PushNotificationService.sendToUser(
        req.user.id,
        "Test All Notifications",
        "You should receive push, email, and SMS",
        { type: "test_all" }
      );

      // Test email
      if (user?.email) {
        await EmailService.sendOrderConfirmation(user.email, {
          orderId: "TEST-ALL",
          customerName: user.name,
          items: [
            { name: "Test Product 1", quantity: 1, price: 25000 }
          ],
          total: 25000
        });
      }

      // Test SMS
      if (user?.phone) {
        await SMSService.sendOrderConfirmation(user.phone, "TEST-ALL");
      }

      res.json({ 
        success: true, 
        message: "All test notifications sent! Check your push, email, and SMS."
      });
    } catch (error: any) {
      console.error("Test all error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  // Get notification settings status
  static async getStatus(req: AuthRequest, res: Response) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { email: true, phone: true }
      });

      const pushTokens = await prisma.pushToken.count({
        where: { userId: req.user.id, active: true }
      });

      res.json({
        hasEmail: !!user?.email,
        hasPhone: !!user?.phone,
        pushTokensRegistered: pushTokens,
        emailConfigured: !!process.env.SMTP_USER,
        smsConfigured: !!process.env.AFRICASTALKING_API_KEY,
        fcmConfigured: !!process.env.FIREBASE_PROJECT_ID
      });
    } catch (error: any) {
      console.error("Get status error:", error);
      res.status(500).json({ error: error.message });
    }
  }
}