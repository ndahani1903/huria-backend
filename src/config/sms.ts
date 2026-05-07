import africastalking from 'africastalking';

const africastalkingConfig = africastalking({
  apiKey: process.env.AFRICASTALKING_API_KEY || '',
  username: process.env.AFRICASTALKING_USERNAME || 'sandbox',
});

export const sms = africastalkingConfig.SMS;