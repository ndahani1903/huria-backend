import axios from "axios";

// ✅ CORRECT BASE URLs from OpenAPI spec
const AZAMPAY_AUTH_URL = "https://authenticator-sandbox.azampay.co.tz";
const AZAMPAY_API_URL = "https://sandbox.azampay.co.tz";

export class AzamPayService {
  
  // ✅ FIXED: Correct token endpoint
  private static async getToken(): Promise<string> {
    try {
      const response = await axios.post(
        `${AZAMPAY_AUTH_URL}/AppRegistration/GenerateToken`,  // ← Changed!
        {
          appName: process.env.AZAMPAY_APP_NAME,
          clientId: process.env.AZAMPAY_CLIENT_ID,
          clientSecret: process.env.AZAMPAY_CLIENT_SECRET,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      console.log("✅ AzamPay token obtained");
      return response.data.data.accessToken;
      
    } catch (error: any) {
      console.error("❌ AzamPay token error:", error.response?.data || error.message);
      throw new Error("Failed to authenticate with AzamPay");
    }
  }

  /**
   * Format phone number for Tanzania (+255)
   */
  private static formatPhone(phone: string): string {
    let clean = phone.replace(/\s/g, "").replace(/^\+/, "");
    if (clean.startsWith("0")) return "255" + clean.substring(1);
    if (clean.startsWith("255")) return clean;
    return "255" + clean;
  }

  /**
   * ✅ FIXED: Correct checkout endpoint
   * Supports: M-Pesa, Airtel Money, Tigo Pesa, Halopesa, Azampesa
   */
  static async initiatePayment(
    amount: number,
    phoneNumber: string,
    orderId: string,
    customerName: string,
    provider: "Airtel" | "Tigo" | "Halopesa" | "Azampesa" | "Mpesa" = "Mpesa"
  ) {
    const token = await this.getToken();
    const formattedPhone = this.formatPhone(phoneNumber);

    const payload = {
      accountNumber: formattedPhone,  // Customer's phone number
      amount: amount,
      currency: "TZS",
      externalId: orderId,  // Your order ID as reference
      provider: provider,   // "Airtel", "Tigo", "Halopesa", "Azampesa", "Mpesa"
      additionalProperties: {
        customerName: customerName,
        orderId: orderId,
      },
    };

    console.log(`📱 Initiating ${provider} payment for ${formattedPhone} - TZS ${amount}`);

    try {
      const response = await axios.post(
        `${AZAMPAY_API_URL}/azampay/mno/checkout`, 
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "X-API-Key": process.env.AZAMPAY_API_KEY,
          },
        }
      );

     console.log("✅ AzamPay response:", JSON.stringify(response.data, null, 2));

  /*// ✅ Extract transaction ID from response
    const transactionId = response.data.transactionId || response.data.data?.transactionId || response.data.referenceId;*/


// ✅ If sandbox and no transactionId, generate a mock one
    let transactionId = response.data.transactionId || response.data.data?.transactionId;
    
    if (!transactionId && process.env.AZAMPAY_ENVIRONMENT === 'sandbox') {
      transactionId = `SANDBOX_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
      console.log(`⚠️ Sandbox mode: Generated mock transaction ID: ${transactionId}`);
    }

      return {
        success: response.data.success || true,
        transactionId: transactionId,
        referenceId: response.data.referenceId,
        provider: provider,
        message: response.data.message || "STK Push sent to customer phone",
      };
      
    } catch (error: any) {
      console.error("❌ AzamPay payment error:", error.response?.data || error.message);
      throw new Error(error.response?.data?.message || "Payment initiation failed");
    }
  }

  /**
   * Check Payment Status
   */
  static async checkStatus(transactionId: string) {
    const token = await this.getToken();
    
    try {
      const response = await axios.get(
        `${AZAMPAY_API_URL}/api/v1/azampay/transactionstatus?pgReferenceId=${transactionId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      return response.data;
    } catch (error: any) {
      console.error("Status check error:", error.response?.data || error.message);
      throw error;
    }
  }
}