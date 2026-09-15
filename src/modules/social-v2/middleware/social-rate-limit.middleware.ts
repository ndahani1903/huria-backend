// src/modules/social-v2/middleware/social-rate-limit.middleware.ts
import { Request, Response, NextFunction } from "express";
import redis from "../../../config/redis";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
}

const defaultConfig: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 60,
  keyPrefix: "social:ratelimit:",
};

export const rateLimit = (config: Partial<RateLimitConfig> = {}) => {
  const { windowMs, maxRequests, keyPrefix } = { ...defaultConfig, ...config };

  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = (req as any).userId;
      if (!userId) {
        return next();
      }

      const key = `${keyPrefix}${userId}`;
      const current = await redis.get(key);

      if (current) {
        const count = parseInt(current.toString(), 10);
        if (count >= maxRequests) {
          return res.status(429).json({
            error: "Too many requests. Please slow down.",
            retryAfter: Math.ceil(windowMs / 1000),
          });
        }
        await redis.incr(key);
      } else {
        await redis.setex(key, Math.ceil(windowMs / 1000), "1");
      }

      next();
    } catch (error) {
      console.error("Rate limit error:", error);
      next();
    }
  };
};

// Predefined rate limiters
export const rateLimits = {
  createPost: rateLimit({ maxRequests: 50, keyPrefix: "social:post:" }),
  createComment: rateLimit({ maxRequests: 100, keyPrefix: "social:comment:" }),
  sendMessage: rateLimit({ maxRequests: 120, keyPrefix: "social:message:" }),
  follow: rateLimit({ maxRequests: 50, keyPrefix: "social:follow:" }),
  storyUpload: rateLimit({ maxRequests: 20, keyPrefix: "social:story:" }),
  reelUpload: rateLimit({ maxRequests: 10, keyPrefix: "social:reel:" }),
  search: rateLimit({ maxRequests: 30, keyPrefix: "social:search:" }),
}; 