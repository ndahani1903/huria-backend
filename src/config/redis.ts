import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;

const redis = redisUrl
  ? new Redis(redisUrl)
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