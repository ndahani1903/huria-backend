import cron from 'node-cron';
import subscriptionService from '../modules/subscription/subscription.service';

// Run every day at 1 AM
cron.schedule('0 1 * * *', async () => {
  console.log('🔄 Processing daily subscription renewals...', new Date().toISOString());
  try {
    await subscriptionService.processMonthlyRenewals();
    console.log('✅ Subscription renewals completed successfully');
  } catch (error) {
    console.error('❌ Subscription renewal failed:', error);
  }
}, {
  timezone: 'Africa/Dar_es_Salaam'  // Tanzania timezone
});

console.log('⏰ Subscription renewal job scheduled (daily at 1 AM Tanzania time)');