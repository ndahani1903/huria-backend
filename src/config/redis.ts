import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

const redis = redisUrl
  ? new Redis(redisUrl, {
      family: 0, // This is the key fix for Railway's IPv6
      retryStrategy: (times) => {
        // Prevent infinite retries and backoff
        if (times > 10) {
          console.error(`Redis retry attempts exceeded (${times}), stopping`);
          return null; // Stop retrying after 10 attempts
        }
        return Math.min(times * 100, 3000);
      },
      maxRetriesPerRequest: 3,
      connectTimeout: 10000, // 10 second timeout
    })
  : null;

if (redis) {
  redis.on("connect", () => {
    console.log("🟢 Redis connected");
  });

  redis.on("ready", () => {
    console.log("✅ Redis ready");
  });

  redis.on("error", (err) => {
    console.error("❌ Redis error:", err.message);
  });
} else {
  console.warn("⚠️ REDIS_URL missing. Redis disabled.");
}

export default redis;