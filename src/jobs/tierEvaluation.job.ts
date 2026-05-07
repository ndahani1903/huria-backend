import cron from 'node-cron';
import merchantTierService from '../modules/merchants/tiers.service';
import { prisma } from '../config/db';

// Run daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  console.log('Running daily tier evaluation...');
  
  const merchants = await prisma.merchant.findMany({
    select: { id: true }
  });
  
  for (const merchant of merchants) {
    await merchantTierService.evaluateAndUpgrade(merchant.id);
  }
  
  console.log(`Evaluated ${merchants.length} merchants`);
});