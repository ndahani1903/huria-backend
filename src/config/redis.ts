import { createClient } from "redis";

export const redis = createClient();

redis.connect().then(() => {
  console.log("🟢 Redis connected");
});

//redis.on("error", err => console.error("Redis Error:", err));

//redis.connect();