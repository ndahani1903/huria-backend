import { PushNotificationService } from './pushNotification.service';
import { EmailService } from './email.service';
import { SMSService } from './sms.service';
import { NotificationSettingsService } from '../modules/notifications/notificationSettings.service';
import { prisma } from '../config/db';
 
export class NotificationService {
  // Send order confirmation via all channels based on user preferences
  static async notifyOrderCreated(userId: string, orderData: any) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) return;

    const settings = await NotificationSettingsService.getSettings(userId);

    // Push notification
    if (settings.pushNotifications) {
      await PushNotificationService.sendToUser(
        userId,
        'Order Confirmed! 🎉',
        `Your order #${orderData.orderId} has been confirmed`,
        { orderId: orderData.orderId, type: 'order_confirmation' }
      );
    }

    // Email notification
    if (settings.emailNotifications && user.email) {
      await EmailService.sendOrderConfirmation(user.email, orderData);
    }

    // SMS notification (only for critical updates if enabled)
    if (settings.smsNotifications && user.phone) {
      await SMSService.sendOrderConfirmation(user.phone, orderData.orderId);
    }
  }


  // Send driver assignment notification
  static async notifyDriverAssigned(userId: string, orderId: string, driverName: string, driverPhone: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) return;

    const settings = await NotificationSettingsService.getSettings(userId);

    if (settings.pushNotifications) {
      await PushNotificationService.sendToUser(
        userId,
        'Driver Assigned! 🚚',
        `${driverName} is on the way to pick up your order`,
        { orderId, driverId: driverPhone, type: 'driver_assigned' }
      );
    }

    if (settings.emailNotifications && user.email) {
      await EmailService.sendDeliveryUpdate(user.email, orderId, 'assigned', driverName);
    }

    if (settings.smsNotifications && user.phone) {
      await SMSService.sendDriverAssigned(user.phone, orderId, driverName, driverPhone);
    }
  }
}