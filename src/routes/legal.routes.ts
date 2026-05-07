import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import marked from 'marked';

const router = Router();

// Path to legal documents
const legalDir = path.join(__dirname, '../legal');

// Helper function to read markdown file
const readLegalFile = (filename: string): string => {
  const filePath = path.join(legalDir, filename);
  return fs.readFileSync(filePath, 'utf-8');
};

// Serve Terms of Service as HTML
router.get('/terms', (req, res) => {
  const content = readLegalFile('TERMS_OF_SERVICE.md');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Terms of Service - Huria Delivery</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          max-width: 900px;
          margin: 0 auto;
          padding: 20px;
          color: #333;
        }
        h1 { color: #0A6E72; border-bottom: 2px solid #0A6E72; padding-bottom: 10px; }
        h2 { color: #1f2937; margin-top: 30px; }
        h3 { color: #374151; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
        th { background: #f3f4f6; }
        code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; }
        .last-updated { color: #6b7280; font-style: italic; margin-bottom: 30px; }
        @media (max-width: 768px) {
          body { padding: 15px; }
          table { font-size: 14px; }
          th, td { padding: 6px 8px; }
        }
      </style>
    </head>
    <body>
      ${marked.parse(content)}
    </body>
    </html>
  `);
});

// Privacy Policy
router.get('/privacy', (req, res) => {
  const content = readLegalFile('PRIVACY_POLICY.md');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Privacy Policy - Huria Delivery</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          max-width: 900px;
          margin: 0 auto;
          padding: 20px;
          color: #333;
        }
        h1 { color: #0A6E72; border-bottom: 2px solid #0A6E72; padding-bottom: 10px; }
        h2 { color: #1f2937; margin-top: 30px; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
        th { background: #f3f4f6; }
        @media (max-width: 768px) {
          body { padding: 15px; }
        }
      </style>
    </head>
    <body>
      ${marked.parse(content)}
    </body>
    </html>
  `);
});

// Cookie Policy
router.get('/cookies', (req, res) => {
  const content = readLegalFile('COOKIE_POLICY.md');
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Cookie Policy - Huria Delivery</title>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          max-width: 900px;
          margin: 0 auto;
          padding: 20px;
          color: #333;
        }
        h1 { color: #0A6E72; border-bottom: 2px solid #0A6E72; padding-bottom: 10px; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
        th { background: #f3f4f6; }
      </style>
    </head>
    <body>
      ${marked.parse(content)}
    </body>
    </html>
  `);
});

// Data Processing Agreement (JSON for API consumption)
router.get('/dpa', (req, res) => {
  const content = readLegalFile('DATA_PROCESSING_AGREEMENT.md');
  res.json({ content: marked.parse(content) });
});

// Merchant Agreement (JSON)
router.get('/merchant-agreement', (req, res) => {
  const content = readLegalFile('MERCHANT_AGREEMENT.md');
  res.json({ content: marked.parse(content) });
});

// Driver Agreement (JSON)
router.get('/driver-agreement', (req, res) => {
  const content = readLegalFile('DRIVER_AGREEMENT.md');
  res.json({ content: marked.parse(content) });
});

// Get all legal documents list
router.get('/list', (req, res) => {
  const documents = [
    { id: 'terms', title: 'Terms of Service', path: '/legal/terms' },
    { id: 'privacy', title: 'Privacy Policy', path: '/legal/privacy' },
    { id: 'cookies', title: 'Cookie Policy', path: '/legal/cookies' },
    { id: 'dpa', title: 'Data Processing Agreement', path: '/legal/dpa' },
    { id: 'merchant', title: 'Merchant Agreement', path: '/legal/merchant-agreement' },
    { id: 'driver', title: 'Driver Agreement', path: '/legal/driver-agreement' }
  ];
  res.json(documents);
});

export default router;