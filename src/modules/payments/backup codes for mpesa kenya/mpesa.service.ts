import axios from 'axios';
import { env } from '../../config/env';

export class MpesaService {
  private static accessToken: string | null = null;
  private static tokenExpiry: number | null = null;

  static async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    try {
      const auth = Buffer.from(
      `${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`
    ).toString('base64');

    const response = await axios.get(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      {
        headers: { Authorization: `Basic ${auth}` },
          timeout: 30000
      }
    );

    this.accessToken = response.data.access_token;
      // Token expires in 3600 seconds, cache for 3500 seconds
      this.tokenExpiry = Date.now() + 3500 * 1000;
      
      console.log('✅ M-Pesa access token obtained');
      return this.accessToken;
      
    } catch (error: any) {
      console.error('❌ Failed to get M-Pesa token:', error.response?.data || error.message);
      throw new Error('M-Pesa authentication failed');
    }
  }

  static async stkPush(phone: string, amount: number, orderId: string) {
    try {
      const token = await this.getAccessToken();

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, '')
      .slice(0, 14);

    // Clean phone number (remove leading 0 or +255)
      let cleanPhone = phone.toString().replace(/\s/g, '');

      // Remove any leading + or 00
    cleanPhone = cleanPhone.replace(/^\+/, '').replace(/^00/, '');

      // If starts with 0, replace with 254
    if (cleanPhone.startsWith('0')) {
      cleanPhone = '254' + cleanPhone.substring(1);
    }
    // If doesn't start with 254, add it
    else if (!cleanPhone.startsWith('254')) {
      cleanPhone = '254' + cleanPhone;
    }

   // ✅ M-Pesa sandbox TEST phone numbers (use these for testing)
    // Valid sandbox test numbers: 254708374149, 254711111111, 254722000000
    // For testing, override with a known working test number:
    const testMode = true; // Set to false for production
    if (testMode) {
      // Use a known working sandbox test number
      cleanPhone = '254708374149';  // Safaricom test number
      console.log(`⚠️ TEST MODE: Using test phone number: ${cleanPhone}`);
    }
    
    // ⚠️ CRITICAL: For sandbox, PartyA and PhoneNumber MUST be the same
    // And they must be a valid test number from Safaricom

   console.log(`📱 Cleaned phone number: ${cleanPhone}`);


      const password = Buffer.from(
      `${env.MPESA_SHORTCODE}${env.MPESA_PASSKEY}${timestamp}`
    ).toString('base64');

    // ✅ FIX: Callback URL - remove the extra https://
    const callbackUrl = env.MPESA_CALLBACK_URL?.replace(/^https?:\/\//, 'https://');
    
    console.log(`📱 Sending STK Push to ${cleanPhone} for ${amount} TZS`);

    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        BusinessShortCode: env.MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Math.round(amount),
        PartyA: cleanPhone,
        PartyB: env.MPESA_SHORTCODE,
        PhoneNumber: cleanPhone,
        CallBackURL: callbackUrl,
        AccountReference: orderId,
        TransactionDesc: 'HURIA Payment',
      },
      {
        headers: { Authorization: `Bearer ${token}` },
          timeout: 30000
      }
    );
    console.log(`✅ STK Push sent successfully for order ${orderId}`);
      return response;

    } catch (error: any) {
      console.error('❌ STK Push failed:', error.response?.data || error.message);
      throw error;
    }
  }

  // ✅ NEW: Query payment status
  static async queryStatus(checkoutRequestId: string) {
    try {
      const token = await this.getAccessToken();
      const timestamp = new Date()
        .toISOString()
        .replace(/[-:.TZ]/g, '')
        .slice(0, 14);

      const password = Buffer.from(
        `${env.MPESA_SHORTCODE}${env.MPESA_PASSKEY}${timestamp}`
      ).toString('base64');

      const response = await axios.post(
        'https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query',
        {
          BusinessShortCode: env.MPESA_SHORTCODE,
          Password: password,
          Timestamp: timestamp,
          CheckoutRequestID: checkoutRequestId,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 30000
        }
      );

      return response.data;
      
    } catch (error: any) {
      console.error('❌ Query status failed:', error.response?.data || error.message);
      throw error;
    }
  }

  // ✅ NEW: Simulate callback for testing (development only)
  static simulateCallback(orderId: string, success: boolean = true) {
    return {
      Body: {
        stkCallback: {
          MerchantRequestID: `SIM-${Date.now()}`,
          CheckoutRequestID: `SIM-CHECKOUT-${Date.now()}`,
          ResultCode: success ? 0 : 1032,
          ResultDesc: success ? 'Success' : 'Request cancelled by user',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 1000 },
              { Name: 'MpesaReceiptNumber', Value: `SIM${Date.now()}` },
              { Name: 'TransactionDate', Value: new Date().toISOString().replace(/[-:]/g, '').slice(0, 14) },
              { Name: 'PhoneNumber', Value: '254712345678' },
              { Name: 'AccountReference', Value: orderId }
            ]
          }
        }
      }
    };
  }
}