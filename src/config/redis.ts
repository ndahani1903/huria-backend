import { createClient } from "redis";

const redisUrl = process.env."redis://default:ytTLWKXYcpRTskkxmMrWyfxwaQOUfwUL@redis.railway.internal:6379" || "redis://localhost:6379";


export const redis = createClient({
  url: redisUrl,
});

redis.on('error', (err) => console.error('Redis Client Error:', err));
redis.on('connect', () => console.log('🟢 Redis connected'));


// ✅ Connect when the app is ready
// This will be called from server.ts or main entry point
export async function connectRedis() {
  if (!redis.isOpen) {
    await redis.connect();
  }
}