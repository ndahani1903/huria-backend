import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";


export const redis = createClient({
  url: redisUrl,
});

redis.on('error', (err) => console.error('Redis Client Error:', err));
redis.on('connect', () => console.log('🟢 Redis connected'));
redis.on('ready', () => console.log('✅ Redis client ready'));

// Auto-connect when the module loads
(async () => {
  if (!redis.isOpen) {
    await redis.connect();
    console.log('🔌 Redis client connected successfully');
  }
})();

// ✅ Connect when the app is ready
// Export a function to ensure connection is ready
(async function initRedis() {
  try {
    if (!redis.isOpen) {
      await redis.connect();
    }
  } catch (err) {
    console.error('Redis connection failed:', err);
  }
})();

export default redis;