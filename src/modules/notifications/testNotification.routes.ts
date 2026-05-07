import { Router } from "express";
import { authMiddleware } from "../../middleware/auth.middleware";
import { TestNotificationController } from "./testNotification.controller";
import { EmailService } from "../../services/email.service";
import { SMSService } from "../../services/sms.service";
import { PushNotificationService } from "../../services/pushNotification.service";
import { prisma } from "../../config/db";

const router = Router();

// Test authentication
router.get("/auth-test", authMiddleware, (req, res) => {
  res.json({ 
    success: true, 
    message: "Auth working!",
    user: req.user 
  });
});


router.get("/ping", (req, res) => {
  res.json({ message: "pong", timestamp: new Date().toISOString() });
});

router.get("/status", (req, res) => {
  res.json({ 
    status: "ok",
    env: {
      jwt: !!process.env.JWT_SECRET,
      email: !!process.env.SMTP_USER,
      sms: !!process.env.AFRICASTALKING_API_KEY
    }
  });
});

// Get notification status
router.get("/notification-status", authMiddleware, async (req: any, res) => {
  try {
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
  } catch (error) {
    console.error("Status error:", error);
    res.status(500).json({ error: "Failed to get status" });
  }
});

// Test push notification
router.post("/test-push", authMiddleware, async (req: any, res) => {
  try {
    // Simple test - just log it for now
    console.log(`Test push to user ${req.user.id}`);
    
    res.json({ 
      success: true, 
      message: "Push test endpoint hit. Implement actual push service." 
    });
  } catch (error) {
    res.status(500).json({ error: "Push test failed" });
  }
});

// Test email
router.post("/test-email", authMiddleware, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user?.email) {
      return res.status(400).json({ error: "No email found for user" });
    }

    console.log(`Test email would be sent to: ${user.email}`);
    
    res.json({ 
      success: true, 
      message: `Email test endpoint hit. Would send to ${user.email}`,
      email: user.email
    });
  } catch (error) {
    res.status(500).json({ error: "Email test failed" });
  }
});

// Test SMS
router.post("/test-sms", authMiddleware, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    if (!user?.phone) {
      return res.status(400).json({ error: "No phone number found for user" });
    }

    console.log(`Test SMS would be sent to: ${user.phone}`);
    
    res.json({ 
      success: true, 
      message: `SMS test endpoint hit. Would send to ${user.phone}`,
      phone: user.phone
    });
  } catch (error) {
    res.status(500).json({ error: "SMS test failed" });
  }
});

// Test all
router.post("/test-all", authMiddleware, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id }
    });

    const results = {
      push: "Test endpoint hit",
      email: user?.email ? `Would send to ${user.email}` : "No email",
      sms: user?.phone ? `Would send to ${user.phone}` : "No phone"
    };

    res.json({ 
      success: true, 
      message: "All test endpoints hit",
      results
    });
  } catch (error) {
    res.status(500).json({ error: "Test all failed" });
  }
});

// Test real email
router.post("/test-real-email", authMiddleware, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user?.email) {
      return res.status(400).json({ error: "No email found for user" });
    }

    console.log(`📧 Sending REAL test email to: ${user.email}`);
    
    const result = await EmailService.sendTestEmail(user.email, user.name);
    
    res.json({ 
      success: true, 
      message: "Real email sent! Check your inbox.",
      messageId: result.messageId,
      to: user.email
    });
  } catch (error: any) {
    console.error("Email error:", error);
    res.status(500).json({ 
      error: error.message,
      details: "Check SMTP configuration"
    });
  }
});

// Test real SMS
router.post("/test-real-sms", authMiddleware, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    if (!user?.phone) {
      return res.status(400).json({ error: "No phone number found for user" });
    }

    console.log(`📱 Sending REAL SMS to: ${user.phone}`);
    
    const result = await SMSService.sendTestSMS(user.phone, user.name);
    
    res.json({ 
      success: true, 
      message: "Real SMS sent! Check your phone.",
      messageId: result.messageId,
      to: user.phone
    });
  } catch (error: any) {
    console.error("SMS error:", error);
    res.status(500).json({ 
      error: error.message,
      details: "Check Africa's Talking configuration"
    });
  }
});

// Test real push
router.post("/test-real-push", authMiddleware, async (req: any, res) => {
  try {
    console.log(`📱 Sending REAL push to user: ${req.user.id}`);
    
    const result = await PushNotificationService.sendTestPush(req.user.id);
    
    res.json({ 
      success: true, 
      message: "Real push notification sent! Check your device.",
      result
    });
  } catch (error: any) {
    console.error("Push error:", error);
    res.status(500).json({ 
      error: error.message,
      details: "Check Firebase configuration"
    });
  }
});

// Test all real notifications
router.post("/test-real-all", authMiddleware, async (req: any, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
    });

    const results: any = {};

    // Test email
    if (user?.email) {
      try {
        results.email = await EmailService.sendTestEmail(user.email, user.name);
      } catch (e: any) {
        results.email = { error: e.message };
      }
    }

    // Test SMS
    if (user?.phone) {
      try {
        results.sms = await SMSService.sendTestSMS(user.phone, user.name);
      } catch (e: any) {
        results.sms = { error: e.message };
      }
    }

    // Test push
    try {
      results.push = await PushNotificationService.sendTestPush(req.user.id);
    } catch (e: any) {
      results.push = { error: e.message };
    }

    res.json({ 
      success: true, 
      message: "Real notifications sent!",
      results
    });
  } catch (error: any) {
    console.error("Test all error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Check configuration status
router.get("/config-status", authMiddleware, async (req: any, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
  });

  const pushTokens = await prisma.pushToken.count({
    where: { userId: req.user.id, active: true },
  });

  res.json({
    user: {
      hasEmail: !!user?.email,
      hasPhone: !!user?.phone,
      email: user?.email,
      phone: user?.phone,
    },
    services: {
      email: {
        configured: !!process.env.SMTP_USER && !!process.env.SMTP_PASS,
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
      },
      sms: {
        configured: !!process.env.AFRICASTALKING_API_KEY,
        username: process.env.AFRICASTALKING_USERNAME,
      },
      push: {
        configured: !!process.env.FIREBASE_PROJECT_ID,
        tokensRegistered: pushTokens,
      },
    },
  });
});



export default router;