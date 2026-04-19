import twilio from 'twilio';

// Initialize Twilio client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

let client: twilio.Twilio | null = null;

if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
  console.log("✅ Twilio SMS service initialized");
} else {
  console.log("⚠️ Twilio not configured - SMS will use console.log fallback");
}

export class SMSService {
  
  static async send(phone: string, message: string): Promise<boolean> {
    // Format phone number (add country code if needed)
    let formattedPhone = phone;
    if (!phone.startsWith('+')) {
      formattedPhone = `+255${phone.replace(/^0+/, '')}`; // Tanzania
    }
    
    console.log(`📱 Sending SMS to ${formattedPhone}: ${message}`);
    
    if (client) {
      try {
        const result = await client.messages.create({
          body: message,
          from: twilioPhone,
          to: formattedPhone,
        });
        console.log(`✅ SMS sent: ${result.sid}`);
        return true;
      } catch (error) {
        console.error(`❌ SMS failed:`, error);
        return false;
      }
    }
    
    // Fallback: just log (for development)
    console.log(`[SMS FALLBACK] To: ${formattedPhone} | Message: ${message}`);
    return true;
  }
  
  // Template messages
  static async sendOrderCreated(phone: string, orderId: string) {
    return this.send(phone, `🛍️ Order #${orderId} created! Track your delivery at: https://app.huria.com/track/${orderId}`);
  }
  
  static async sendPaymentReceived(phone: string, orderId: string, amount: number) {
    return this.send(phone, `💰 Payment of TZS ${amount} received for order #${orderId}. Your driver will be assigned shortly.`);
  }
  
  static async sendDriverAssigned(phone: string, orderId: string, driverName: string, eta: number) {
    return this.send(phone, `🚚 Driver ${driverName} assigned to order #${orderId}. ETA: ${eta} minutes. Track live: https://app.huria.com/track/${orderId}`);
  }
  
  static async sendOrderDelivered(phone: string, orderId: string, otp: string) {
    return this.send(phone, `📦 Order #${orderId} delivered! Give OTP: ${otp} to the driver to complete.`);
  }
  
  static async sendOrderCompleted(phone: string, orderId: string) {
    return this.send(phone, `✅ Order #${orderId} completed! Thank you for using HURIA Delivery. Rate your driver: https://app.huria.com/rate/${orderId}`);
  }
  
  static async sendDriverNewOrder(phone: string, orderId: string, pickupAddress: string, distance: number) {
    return this.send(phone, `🆕 New order #${orderId}! Pickup: ${pickupAddress}. Distance: ${distance.toFixed(1)}km. Open app to accept.`);
  }
  
  static async sendDriverEarnings(phone: string, amount: number, orderId: string) {
    return this.send(phone, `💰 TZS ${amount} added to your wallet for order #${orderId}. Total balance: check app.`);
  }
  
  static async sendWithdrawalProcessed(phone: string, amount: number, reference: string) {
    return this.send(phone, `💸 Withdrawal of TZS ${amount} processed. Reference: ${reference}. Money sent to your mobile money.`);
  }
}