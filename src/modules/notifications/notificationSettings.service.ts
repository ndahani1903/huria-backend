import { prisma } from "../../config/db";

export class NotificationSettingsService {
  static async getSettings(userId: string) {
    let settings = await prisma.userNotificationSettings.findUnique({
      where: { userId }
    });

    if (!settings) {
      // Create default settings if none exist
      settings = await prisma.userNotificationSettings.create({
        data: { userId }
      });
    }

    return {
      pushNotifications: settings.pushEnabled,
      emailNotifications: settings.emailEnabled,
      smsNotifications: settings.smsEnabled,
      orderConfirmations: settings.orderConfirmations,
      paymentUpdates: settings.paymentUpdates,
      deliveryUpdates: settings.deliveryUpdates,
      promotions: settings.promotions,
      marketingEmails: settings.marketingEmails
    };
  }

  static async updateSettings(userId: string, data: any) {
    const settings = await prisma.userNotificationSettings.update({
      where: { userId },
      data: {
        pushEnabled: data.pushNotifications !== undefined ? data.pushNotifications : undefined,
        emailEnabled: data.emailNotifications !== undefined ? data.emailNotifications : undefined,
        smsEnabled: data.smsNotifications !== undefined ? data.smsNotifications : undefined,
        orderConfirmations: data.orderConfirmations,
        paymentUpdates: data.paymentUpdates,
        deliveryUpdates: data.deliveryUpdates,
        promotions: data.promotions,
        marketingEmails: data.marketingEmails
      }
    });

    return {
      pushNotifications: settings.pushEnabled,
      emailNotifications: settings.emailEnabled,
      smsNotifications: settings.smsEnabled,
      orderConfirmations: settings.orderConfirmations,
      paymentUpdates: settings.paymentUpdates,
      deliveryUpdates: settings.deliveryUpdates,
      promotions: settings.promotions,
      marketingEmails: settings.marketingEmails
    };
  }

  static async shouldSendNotification(userId: string, type: string): Promise<boolean> {
    const settings = await this.getSettings(userId);
    
    switch(type) {
      case 'push':
        return settings.pushNotifications;
      case 'email':
        return settings.emailNotifications;
      case 'sms':
        return settings.smsNotifications;
      case 'order_confirmation':
        return settings.orderConfirmations && settings.pushNotifications;
      case 'payment_update':
        return settings.paymentUpdates && (settings.pushNotifications || settings.emailNotifications);
      case 'delivery_update':
        return settings.deliveryUpdates && (settings.pushNotifications || settings.smsNotifications);
      default:
        return true;
    }
  }
}