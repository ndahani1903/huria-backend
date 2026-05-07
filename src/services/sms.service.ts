import { sms } from '../config/sms';

export class SMSService {
    // ✅ Helper function to format phone number correctly for Africa's Talking
  static formatPhoneNumber(phone: string): string {
    // Remove any spaces, dashes, or parentheses
    let cleaned = phone.replace(/\s+/g, '').replace(/[-()]/g, '');
    
    // Remove the '+' if present
   // cleaned = cleaned.replace('+', '');
    
    // If it starts with '0', replace with '255' (Tanzania country code)
    if (cleaned.startsWith('0')) {
      cleaned = '+255' + cleaned.substring(1);
    }
    // If it starts with '255', keep as is
    else if (cleaned.startsWith('+255')) {
      // Already correct format
    }
    // If it's a 9-digit number starting with 6 or 7, add '255'
    else if (cleaned.match(/^[67]\d{8}$/)) {
      cleaned = '255' + cleaned;
    }
    
    console.log(`📱 Formatted phone: ${phone} -> ${cleaned}`);
    return cleaned;
  }


  // Send real SMS
  static async sendRealSMS(phone: string, message: string) {
    try {
      // Format phone number (remove + if present)
      const formattedPhone = this.formatPhoneNumber(phone);
      
     console.log(`📤 Sending SMS to: ${formattedPhone}`);
      
 // For sandbox, you need to add test numbers in Africa's Talking dashboard
      const result = await sms.send({
        to: formattedPhone,
        message,
        from: process.env.SMS_SENDER_ID || 'HURIA',
      });
      
      console.log("✅ SMS sent:", result);
      return { success: true, messageId: result.SMSMessageData?.Recipients?.[0]?.messageId };
    } catch (error) {
      console.error("❌ SMS failed:", error);
      
      // Provide helpful error message
      let errorMessage = error.message;
      if (errorMessage.includes('Invalid country calling code')) {
        errorMessage = 'Invalid phone number format. Please use format: 0712345678 or +255712345678';
      } else if (errorMessage.includes('sandbox')) {
        errorMessage = 'Your phone number must be added to Africa\'s Talking sandbox recipients. Login to your Africa\'s Talking dashboard and add your number.';
      }
      
      throw new Error(errorMessage);
    }
  }

  // Test SMS
  static async sendTestSMS(phone: string, userName: string) {
    const message = `🔧 HURIA Test SMS\n\nHello ${userName}, this is a REAL test SMS from your HURIA Delivery platform. If you received this, your SMS configuration is working correctly! ✅\n\nSent at: ${new Date().toLocaleString()}`;
    
    return this.sendRealSMS(phone, message);
  }

 static async sendOrderCreated(phone: string, orderId: string) {
   const message = `HURIA\n\nHello!: 🛍️ Order #${orderId} created!
Track: ${process.env.APP_URL}/tracking/${orderId}\n\nSent at: ${new Date().toLocaleString()}`;
  
    return this.sendRealSMS(phone, message);
  }

static async sendPaymentReceived(phone: string, orderId: string, amount: number) {
    const message = `HURIA: 💰 Payment of TZS ${amount} received for order #${orderId}. Your driver will be assigned shortly.`;
    
    return this.sendRealSMS(phone, message);
  }

  // Send order confirmation SMS
  static async sendOrderConfirmation(phone: string, orderId: string) {
    const message = `HURIA: Order #${orderId} confirmed! 
Track: ${process.env.APP_URL}/tracking/${orderId}`;
    
    return this.sendRealSMS(phone, message);
  }

  // Send driver assignment SMS
  static async sendDriverAssigned(phone: string, orderId: string, driverName: string, driverPhone: string) {
    const message = `HURIA: Driver ${driverName} (${driverPhone}) assigned to order #${orderId}. Track live: ${process.env.APP_URL}/tracking/${orderId}`;
    
     return this.sendRealSMS(phone, message);
  }

  // Send delivery SMS
  static async sendOrderDelivered(phone: string, orderId: string, status: string) {
    const messages = {
      picked_up: `HURIA: Your order #${orderId} has been picked up! Track: ${process.env.APP_URL}/tracking/${orderId}`,
      delivered: `HURIA: Order #${orderId} delivered! Rate: ${process.env.APP_URL}/rate/${orderId}`,
    };

    const message = messages[status];
    if (message) {
      return this.sendRealSMS(phone, message);
    }
    return { success: false, message: "Unknown status" };
  }

  // Send OTP for verification
  static async sendOTP(phone: string, otp: string) {
    const message = `HURIA: Your verification code is: ${otp}. Valid for 5 minutes. Give OTP: ${otp} to the driver to complete.`;
    
    await this.sendRealSMS(phone, message);
  }


  static async sendOrderCompleted(phone: string, orderId: string) {
      const message = `HURIA: ✅ Order #${orderId} completed! Thank you for using HURIA Delivery. Rate your driver: https://app.huria.com/rate/${orderId}`;
    
    await this.sendRealSMS(phone, message);
  }
  
  static async sendDriverNewOrder(phone: string, orderId: string, pickupAddress: string, distance: number) {
    const message = `HURIA: New order #${orderId}! Pickup: ${pickupAddress}. Distance: ${distance.toFixed(1)}km. Open app to accept.`;
    
    await this.sendRealSMS(phone, message);
  }

  static async sendDriverEarnings(phone: string, amount: number, orderId: string) {
    const message = `HURIA: 💰 TZS ${amount} added to your wallet for order #${orderId}. Total balance: check app.`;
    
    await this.sendRealSMS(phone, message);
  }
   
  static async sendWithdrawalProcessed(phone: string, amount: number, reference: string) {
    const message = `HURIA: 💸 Withdrawal of TZS ${amount} processed. Reference: ${reference}. Money sent to your mobile money.`;
    
    await this.sendRealSMS(phone, message);
  }

  // Generic send method
  private static async send(phone: string, message: string) {
    try {
      // Format phone number (remove + if present)
      const formattedPhone = phone.replace('+', '');
      
      const result = await sms.sendRealSMS({
        to: formattedPhone,
        message,
        from: process.env.SMS_SENDER_ID || 'HURIA',
      });
      
      console.log('SMS sent:', result);
      return result;
    } catch (error) {
      console.error('SMS sending failed:', error);
      throw error;
    }
  }
}






{/*import twilio from 'twilio';

// Initialize Twilio client
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

let client: twilio.Twilio | null = null;

 //i dont have twillio yet
if (accountSid && authToken) {
  client = twilio(accountSid, authToken);
  console.log("✅ Twilio SMS service initialized");
} else {
  console.log("⚠️ Twilio not configured - SMS will use console.log fallback");
} 
 
export class SMSService {
 
 
}*/}