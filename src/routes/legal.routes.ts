import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';

marked.setOptions({
  gfm: true,
  breaks: true
});

const router = Router();

// Path to legal documents
const legalDir = path.resolve(process.cwd(), 'legal');

// Helper function to read markdown file
const readLegalFile = (filename: string): string => {
  const filePath = path.join(legalDir, filename);
console.log("Legal directory:", legalDir);
console.log("Reading file:", filePath);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filename}`);
  }
  return fs
  .readFileSync(filePath, 'utf-8')
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '\n');
};

// Helper function to send HTML response
const sendHTML = (content: string, title: string, res: any) => {
console.log(marked.parse(content));
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <title>${title} - Huria Delivery</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="description" content="${title} of Huria Delivery Platform">
      <meta name="robots" content="index, follow">
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
	  max-width: 1000px;
	  margin: 0 auto; 
	  padding: 20px;
          color: #333;
          background: #f8f9fa;
        }
        .legal-container {
          max-width: 1000px;
          margin: 0 auto;
          padding: 20px;
        }
        .legal-header {
          background: white;
          padding: 20px 30px;
          border-radius: 12px;
          margin-bottom: 20px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 15px;
        }
        .legal-header h1 {
          color: #0A6E72;
          margin: 0;
          font-size: 24px;
        }
        .legal-content table {
  width: 100%;
  border-collapse: collapse;
  margin: 24px 0;
  overflow: hidden;
  border-radius: 10px;
}

.legal-content th {
  background: #0A6E72;
  color: white;
  font-weight: 600;
}

.legal-content th,
.legal-content td {
  padding: 14px;
  border: 1px solid #e5e7eb;
}

.legal-content tr:nth-child(even) {
  background: #f9fafb;
}
        .back-button {
          background: #0A6E72;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 14px;
          text-decoration: none;
          display: inline-block;
          transition: background 0.2s;
        }
        .back-button:hover {
          background: #085a5e;
        }
        .legal-content {
          background: white;
          padding: 40px;
          border-radius: 12px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        .legal-content h1 { 
          color: #0A6E72; 
          border-bottom: 2px solid #0A6E72; 
          padding-bottom: 10px;
          margin-bottom: 20px;
        }
        .legal-content h2 { 
          color: #1f2937; 
          margin-top: 30px;
          margin-bottom: 15px;
        }
        .legal-content h3 { 
          color: #374151; 
          margin-top: 20px;
        }
        .legal-content p { 
          margin-bottom: 15px; 
        }
        .legal-content ul, .legal-content ol { 
          margin: 15px 0 15px 30px; 
        }
        .legal-content li { 
          margin-bottom: 8px; 
        }
        .legal-content table { 
          border-collapse: collapse; 
          width: 100%; 
          margin: 20px 0; 
        }
        .legal-content th, .legal-content td { 
          border: 1px solid #ddd; 
          padding: 10px 12px; 
          text-align: left; 
        }
        .legal-content th { 
          background: #f3f4f6; 
          font-weight: 600;
        }
        .legal-content code { 
          background: #f3f4f6; 
          padding: 2px 6px; 
          border-radius: 4px; 
          font-family: monospace;
        }
        .legal-content blockquote {
          border-left: 4px solid #0A6E72;
          margin: 20px 0;
          padding: 10px 20px;
          background: #f8f9fa;
          font-style: italic;
        }
        .last-updated { 
          color: #6b7280; 
          font-style: italic; 
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          font-size: 13px;
        }
        @media (max-width: 768px) {
          .legal-container { padding: 15px; }
          .legal-content { padding: 20px; }
          .legal-header { padding: 15px 20px; }
          .legal-header h1 { font-size: 20px; }
          .legal-content table { font-size: 14px; }
          .legal-content th, .legal-content td { padding: 6px 8px; }
        }
        @media print {
          .legal-header { display: none; }
          .legal-content { padding: 0; }
          body { background: white; }
        }
      </style>
    </head>
    <body>
      <div class="legal-container">
        <div class="legal-header">
          <h1>${title}</h1>
          <button onclick="window.history.back()" class="back-button">← Back to Site</button>
        </div>
        <div class="legal-content">
          ${content}
          <div class="last-updated">
            Last updated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </div>
      </div>
    </body>
    </html>
  `);
};

// Helper function to send JSON response
const sendJSON = (content: string, res: any) => {
  res.json({ 
    content: marked.parse(content),
    timestamp: new Date().toISOString()
  });
};

// List all available legal documents (public endpoint)
router.get('/list', (req, res) => {
  const documents = [
    { id: 'terms', title: 'Terms of Service', path: '/legal/terms', type: 'html'},
    { id: 'privacy', title: 'Privacy Policy', path: '/legal/privacy', type: 'html' },
    { id: 'cookies', title: 'Cookie Policy', path: '/legal/cookies', type: 'html' },
    { id: 'refund', title: 'Refund Policy', path: '/legal/refund', type: 'html' },
    { id: 'delivery', title: 'Delivery Policy', path: '/legal/delivery', type: 'html'},
    { id: 'exchange', title: 'Exchange Policy', path: '/legal/exchange', type: 'html'},
    { id: 'warranty', title: 'Warranty Policy', path: '/legal/warranty', type: 'html'},
    { id: 'pre-policy', title: 'Pre-Order Policy', path: '/legal/pre-policy', type: 'html'},
    { id: 'EPP', title: 'EMI and Payment Policy', path: '/legal/EPP', type: 'html' }
     ];

  /*   const roleSpecificDocs = [];

    if (req.user.role === 'merchant') {
    roleSpecificDocs.push(
      { id: 'merchant', title: 'Merchant Agreement', path: '/legal/merchant-agreement', type: 'html', roles: ['merchant'] },
      { id: 'dpa', title: 'Data Processing Agreement', path: '/legal/dpa', type: 'html', roles: ['merchant', 'driver'] }
    );
  }

   if (req.user.role === 'driver') {
    roleSpecificDocs.push(
      { id: 'driver', title: 'Driver Agreement', path: '/legal/driver-agreement', type: 'html', roles: ['driver'] },
      { id: 'dpa', title: 'Data Processing Agreement', path: '/legal/dpa', type: 'html', roles: ['merchant', 'driver'] }
    );
  }
  
  // For public access (no auth), only return public docs
  if (!req.user) {
    return res.json(documents);
}

res.json([...documents, ...roleSpecificDocs]);*/

 return res.json(documents);
});

// Serve Terms of Service
router.get('/terms', (req, res) => {
  try {
    const filePath = path.join(legalDir, 'TERMS_OF_SERVICE.html');
    res.sendFile(filePath);
  } catch (error) {
    res.status(404).send('<h1>Document not found</h1><p>The requested legal document is currently unavailable.</p><a href="/">Return to Home</a>');
  }
});

// Privacy Policy
router.get('/privacy', (req, res) => {
  try {
    const content = readLegalFile('PRIVACY_POLICY.html');
    res.send(content);
  } catch (error) {
    res.status(404).send('<h1>Document not found</h1><p>The requested legal document is currently unavailable.</p><a href="/">Return to Home</a>');
  }
});

// Cookie Policy
router.get('/cookies', (req, res) => {
  try {
    const content = readLegalFile('COOKIE_POLICY.html');
    res.send(content);
  } catch (error) {
    res.status(404).send('<h1>Document not found</h1><p>The requested legal document is currently unavailable.</p><a href="/">Return to Home</a>');
  }
});

// Refund Policy
router.get('/refund', (req, res) => {
  try {
    const content = readLegalFile('REFUND_POLICY.html');
    res.send(content);
  } catch (error) {
    // If file doesn't exist, create a default one
    const defaultContent = `# Refund Policy

## Our Refund Policy

At Huria Delivery, we strive to ensure your satisfaction with every purchase. If you are not completely satisfied with your purchase, we're here to help.

### Returns
You have 7 calendar days to return an item from the date you received it.

### Conditions for Return
- Item must be unused and in the same condition that you received it
- Item must be in the original packaging
- Proof of purchase is required

### Refunds
Once we receive your item, we will inspect it and notify you on the status of your refund. If approved, we will initiate a refund to your original method of payment.

### Contact Us
For any questions about our refund policy, please contact our support team.`;
    sendHTML(defaultContent, 'Refund Policy', res);
  }
});

// Delivery Policy
router.get('/delivery', (req, res) => {
  try {
    const content = readLegalFile('DELIVERY_POLICY.html');
    res.send(content);
  } catch (error) {
    const defaultContent = `# Delivery Policy

## Delivery Information

At Huria Delivery, we are committed to delivering your orders quickly and reliably.

### Delivery Time
- Standard Delivery: 30-60 minutes
- Express Delivery: 15-30 minutes
- Scheduled Delivery: As selected at checkout

### Delivery Areas
We currently deliver in:
- Dar es Salaam (all districts)
- Arusha (central area)
- Mwanza (city center)

### Delivery Fees
- Orders under TSh 30,000: TSh 2,000 delivery fee
- Orders above TSh 30,000: Free delivery

### Tracking
You can track your order in real-time through our app.`;
    sendHTML(defaultContent, 'Delivery Policy', res);
  }
});

// Exchange Policy
router.get('/exchange', (req, res) => {
  try {
    const content = readLegalFile('EXCHANGE_POLICY.html');
    res.send(content);
  } catch (error) {
    const defaultContent = `# Exchange Policy

## Exchange Information

We want you to love your purchase. If you need to exchange an item, we're here to help.

### Exchange Period
You have 7 days from delivery date to request an exchange.

### Conditions
- Item must be unused and in original condition
- Original tags and packaging must be intact
- Proof of purchase required

### Process
1. Contact customer support
2. Return the original item
3. We'll process your exchange request
4. New item will be delivered within 2-3 days`;
    sendHTML(defaultContent, 'Exchange Policy', res);
  }
});

// Warranty Policy
router.get('/warranty', (req, res) => {
  try {
    const content = readLegalFile('WARRANTY_POLICY.html');
    res.send(content);
  } catch (error) {
    const defaultContent = `# Warranty Policy

## Warranty Coverage

Huria Delivery offers warranty protection on eligible products.

### Standard Warranty
- Electronics: 1 year
- Appliances: 6 months
- Accessories: 3 months

### What's Covered
- Manufacturing defects
- Hardware malfunctions
- Battery issues (within 6 months)

### What's Not Covered
- Accidental damage
- Water damage
- Normal wear and tear
- Unauthorized repairs

### How to Claim
1. Contact support within warranty period
2. Provide proof of purchase
3. Return the product for inspection
4. Replacement or repair within 14 days`;
    sendHTML(defaultContent, 'Warranty Policy', res);
  }
});

// Pre-Order Policy
router.get('/pre-policy', (req, res) => {
  try {
    const content = readLegalFile('PRE_ORDER_POLICY.html');
    res.send(content);
  } catch (error) {
    const defaultContent = `# Pre-Order Policy

## Pre-Order Information

Thank you for pre-ordering with Huria Delivery.

### How Pre-Orders Work
- Full payment required at time of pre-order
- Estimated delivery date provided at checkout
- You can cancel within 24 hours for full refund

### Payment
Full payment is collected at the time of pre-order to secure your item.

### Delivery Timeline
- Pre-order items ship on or before the estimated date
- You'll receive tracking information once shipped
- Delays may occur due to supply chain issues

### Cancellations
- Within 24 hours: Full refund
- After 24 hours: Store credit only
- After shipping: No cancellations accepted`;
    sendHTML(defaultContent, 'Pre-Order Policy', res);
  }
});

// EMI and Payment Policy
router.get('/EPP', (req, res) => {
  try {
    const content = readLegalFile('EMI_AND_PAYMENT_POLICY.html');
    res.send(content);
  } catch (error) {
    const defaultContent = `# EMI and Payment Policy

## Payment Methods

We accept various payment methods for your convenience.

### Accepted Payments
- Credit/Debit Cards (Visa, Mastercard)
- Mobile Money (M-Pesa, Tigo Pesa, Airtel Money)
- Bank Transfer
- Cash on Delivery (selected areas)

### EMI Options
- 3 months: 0% interest
- 6 months: 5% interest
- 12 months: 10% interest

### Eligibility
- Minimum purchase: TSh 100,000
- Valid ID required
- Credit check may apply

### Payment Security
All payments are processed through secure, PCI-compliant gateways.`;
    sendHTML(defaultContent, 'EMI and Payment Policy', res);
  }
});

// Data Processing Agreement (JSON for API consumption)
router.get('/dpa', authMiddleware, (req, res) => {
  try {
    const content = readLegalFile('DATA_PROCESSING_AGREEMENT.html');
    // Check if user is either merchant or driver
    if (req.user.role === 'merchant' || req.user.role === 'driver') {
      res.send(content);
    } else {
      res.status(403).send('<h1>Access Denied</h1><p>This document is only available to merchants and drivers.</p>');
    }
  } catch (error) {
    res.status(404).json({ error: 'Document not found' });
  }
});

// ==================== ROLE-SPECIFIC DOCUMENTS (Auth Required) 

// Merchant Agreement (JSON)
router.get('/merchant-agreement', authMiddleware, requireRole('merchant'),  (req, res) => {
  try {
    const content = readLegalFile('MERCHANT_AGREEMENT.html');
    sendJSON(content, res);
  } catch (error) {
    res.status(404).json({ error: 'Document not found' });
  }
});

// Driver Agreement (JSON)
router.get('/driver-agreement', authMiddleware, requireRole('driver'), (req, res) => {
  try {
    const content = readLegalFile('DRIVER_AGREEMENT.html');
    sendJSON(content, res);
  } catch (error) {
    res.status(404).json({ error: 'Document not found' });
  }
});

export default router;