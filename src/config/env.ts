import dotenv from 'dotenv';

dotenv.config();

export const env = {
  PORT: process.env.PORT || 5000,
  JWT_SECRET: process.env.JWT_SECRET!,

  MPESA_CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY!,
  MPESA_CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET!,
  MPESA_SHORTCODE: process.env.MPESA_SHORTCODE!,
  MPESA_PASSKEY: process.env.MPESA_PASSKEY!,
  MPESA_CALLBACK_URL: process.env.MPESA_CALLBACK_URL!,
};