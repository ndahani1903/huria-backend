import transporter from '../config/email';

export class EmailService {
  // Send real email
  static async sendRealEmail(to: string, subject: string, html: string) {
    try {
      const info = await transporter.sendMail({
        from: `"HURIA Delivery" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html,
      });
      
      console.log("✅ Email sent:", info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error("❌ Email failed:", error);
      throw error;
    }
  }

  // Test email
  static async sendTestEmail(to: string, userName: string) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h1 style="color: #FF9900;">🎉 Test Email from HURIA!</h1>
        <p>Hello <strong>${userName}</strong>,</p>
        <p>This is a <strong>real test email</strong> from your HURIA Delivery platform.</p>
        <p>If you received this, your email configuration is working correctly! ✅</p>
        <hr style="margin: 20px 0;" />
        <p style="color: #666; font-size: 12px;">Sent at: ${new Date().toLocaleString()}</p>
        <p style="color: #666; font-size: 12px;">HURIA Delivery - Fast, Smart, Reliable</p>
      </div>
    `;
    
    return this.sendRealEmail(to, "✅ HURIA Test Email - Configuration Working!", html);
  }

  // Send order confirmation email
  static async sendOrderConfirmation(to: string, orderData: any) {
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #FF9900;">Order Confirmed! 🎉</h1>
        <p>Hello ${orderData.customerName},</p>
        <p>Your order <strong>#${orderData.orderId}</strong> has been confirmed.</p>
        
        <h3>Order Summary:</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 10px; text-align: left;">Item</th>
              <th style="padding: 10px; text-align: left;">Quantity</th>
              <th style="padding: 10px; text-align: left;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${orderData.items.map((item: any) => `
              <tr>
                <td style="padding: 10px;">${item.name}</td>
                <td style="padding: 10px;">${item.quantity}</td>
                <td style="padding: 10px;">TSh ${item.price.toLocaleString()}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <p><strong>Total: TSh ${orderData.total.toLocaleString()}</strong></p>
        
        <p>Track your order: <a href="${process.env.APP_URL}/tracking/${orderData.orderId}">Click here</a></p>
        
        <hr />
        <p style="color: #666; font-size: 12px;">Thank you for shopping with HURIA!</p>
      </div>
    `;

     return this.sendRealEmail(to, `Order Confirmed - #${orderData.orderId}`, html);
    }
 

  // Send delivery update email
  static async sendDeliveryUpdate(to: string, orderId: string, status: string, driverName?: string) {
    const statusMessages = {
      assigned: `Driver ${driverName} has been assigned to your order`,
      picked_up: 'Your order has been picked up and is on the way',
      delivered: 'Your order has been delivered! Rate your experience',
    };

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #FF9900;">Delivery Update 🚚</h1>
        <p>Order #${orderId}</p>
        <p>${statusMessages[status as keyof typeof statusMessages] || status}</p>
        
        <a href="${process.env.APP_URL}/tracking/${orderId}" style="background: #FF9900; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          Track Order
        </a>
      </div>
    `;


  return this.sendRealEmail(to, `Delivery Update - Order #${orderId}`, html);
    }
  

  // Send password reset email
  static async sendPasswordReset(to: string, token: string) {
    const resetLink = `${process.env.APP_URL}/reset-password?token=${token}`;
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #FF9900;">Reset Your Password</h1>
        <p>Click the link below to reset your password. This link expires in 1 hour.</p>
        
        <a href="${resetLink}" style="background: #FF9900; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          Reset Password
        </a>
        
        <p>If you didn't request this, ignore this email.</p>
      </div>
    `;

    return this.sendRealEmail(to, 'Reset Your Password', html);
  }
}