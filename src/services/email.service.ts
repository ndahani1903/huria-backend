import transporter from '../config/email';
import fs from 'fs';
import path from 'path';
//import puppeteer from 'puppeteer';

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

/*static async sendSignedAgreementEmail(email: string, name: string, role: string, signatureBase64: string) {
    // Generate PDF of signed agreement
  const pdfBuffer = await generateAgreementPDF(role, name, signatureBase64);

   await transporter.sendMail({
    from: `"Huria Delivery" <${process.env.SMTP_FROM}>`,
    to: email,
    subject: `Your Signed ${role === 'merchant' ? 'Merchant' : 'Driver'} Agreement - Huria Delivery`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2>Welcome to Huria Delivery, ${name}!</h2>
        <p>Thank you for signing your ${role === 'merchant' ? 'Merchant' : 'Driver'} Agreement.</p>
        <p>Please find attached your signed agreement for your records.</p>
        <div style="margin: 20px 0; padding: 15px; background: #f5f5f5;">
          <p><strong>What's next?</strong></p>
          <p>${role === 'merchant' 
            ? 'Start adding products and accepting orders!' 
            : 'You can now start accepting delivery requests!'}</p>
        </div>
        <p>Best regards,<br/>Huria Delivery Team</p>
      </div>
    `,
    attachments: [{
      filename: `Huria_${role}_Agreement_Signed.pdf`,
      content: pdfBuffer,
      contentType: 'application/pdf'
    }]
  });
}

  static async generateAgreementPDF(role: string, name: string, signatureBase64: string): Promise<Buffer> {
    const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  // Load the agreement markdown file
  const agreementPath = path.join(__dirname, `../legal/${role.toUpperCase()}_AGREEMENT.md`);
  const agreementContent = fs.readFileSync(agreementPath, 'utf-8');
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; }
        .header { text-align: center; margin-bottom: 40px; }
        .signature-section { margin-top: 50px; border-top: 1px solid #ccc; padding-top: 20px; }
        .signature-image { max-width: 200px; margin-top: 10px; }
        .date { margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${role.toUpperCase()} AGREEMENT</h1>
        <p>Huria Delivery Platform</p>
      </div>
      <div class="content">
        ${marked.parse(agreementContent)}
      </div>
      <div class="signature-section">
        <p><strong>Signed by:</strong> ${name}</p>
        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
        <p><strong>Signature:</strong></p>
        <img src="${signatureBase64}" class="signature-image" />
      </div>
    </body>
    </html>
  `;
  
  await page.setContent(html);
  const pdf = await page.pdf({ format: 'A4' });
  await browser.close();
  
  return pdf;
}*/


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