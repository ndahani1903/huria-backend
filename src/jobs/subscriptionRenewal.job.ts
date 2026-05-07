import cron from 'node-cron';
import subscriptionService from '../modules/subscription/subscription.service';

// Run every day at 1 AM
cron.schedule('0 1 * * *', async () => {
  console.log('Processing subscription renewals...');
  await subscriptionService.processMonthlyRenewals();
  console.log('Subscription renewals completed');
});