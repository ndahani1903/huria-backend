export class NotificationService {
  static async sendSMS(phone: string, message: string) {
    console.log(`📩 SMS to ${phone}: ${message}`);

    // Later: integrate Twilio / Africa's Talking
  }

  static async sendOrderUpdate(phone: string, status: string) {
    const message = `Your order status is now: ${status}`;
    await this.sendSMS(phone, message);
  }
}
