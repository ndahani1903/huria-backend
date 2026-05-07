import cron from 'node-cron';
import { Redis } from 'ioredis';

const redis = new Redis();

// Reset daily leaderboard at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('🔄 Resetting daily leaderboard...');
  await redis.del('leaderboard:daily');
  console.log('✅ Daily leaderboard reset complete');
});

// Reset weekly leaderboard on Monday at midnight
cron.schedule('0 0 * * 1', async () => {
  console.log('🔄 Resetting weekly leaderboard...');
  await redis.del('leaderboard:weekly');
  console.log('✅ Weekly leaderboard reset complete');
});

// Reset monthly leaderboard on 1st of month at midnight
cron.schedule('0 0 1 * *', async () => {
  console.log('🔄 Resetting monthly leaderboard...');
  await redis.del('leaderboard:monthly');
  console.log('✅ Monthly leaderboard reset complete');
});

console.log('🏆 Gamification cron jobs scheduled');