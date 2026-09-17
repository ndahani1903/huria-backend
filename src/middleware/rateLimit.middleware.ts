import { Request, Response, NextFunction } from "express";
import redis from "../config/redis";

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  skipOnError?: boolean;
}

class RateLimiter {
  private configs: Map<string, RateLimitConfig> = new Map();

  constructor() {
    // Default API rate limit
    this.configs.set("default", {
      windowMs: 60 * 1000,
      maxRequests: 100,
      keyPrefix: "rl:default",
    });

    // Authentication rate limit
    this.configs.set("auth", {
      windowMs: 15 * 60 * 1000,
      maxRequests: 5,
      keyPrefix: "rl:auth",
    });

    // Payment rate limit
    this.configs.set("payment", {
      windowMs: 60 * 1000,
      maxRequests: 10,
      keyPrefix: "rl:payment",
    });

    // General API rate limit
    this.configs.set("api", {
      windowMs: 60 * 1000,
      maxRequests: 500,
      keyPrefix: "rl:api",
    });

    // Admin rate limit
    this.configs.set("admin", {
      windowMs: 60 * 1000,
      maxRequests: 200,
      keyPrefix: "rl:admin",
    });

    // Withdrawal rate limit
    this.configs.set("withdrawal", {
      windowMs: 60 * 1000,
      maxRequests: 10,
      keyPrefix: "rl:withdrawal",
    });
  }

  async checkLimit(
    identifier: string,
    limitType: string = "default"
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    const config =
      this.configs.get(limitType) || this.configs.get("default")!;

    const key = `${config.keyPrefix}:${identifier}`;
    const now = Date.now();

    try {
      // ======================================================
      // ATOMIC REDIS SLIDING-WINDOW RATE LIMIT
      // ======================================================

      const luaScript = `
        local key = KEYS[1]
        local windowMs = tonumber(ARGV[1])
        local maxRequests = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])

        -- Remove old entries
        redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)

        -- Get current count
        local current = redis.call('ZCARD', key)

        -- Check if request is allowed
        if current < maxRequests then
          -- Add current request
          redis.call('ZADD', key, now, now)

          -- Keep key alive for the duration of the window
          redis.call('EXPIRE', key, math.ceil(windowMs / 1000))

          return {
            1,
            maxRequests - current - 1,
            now + windowMs
          }
        else
          -- Get oldest request for reset calculation
          local oldest = redis.call(
            'ZRANGE',
            key,
            0,
            0,
            'WITHSCORES'
          )

          local resetTime = tonumber(oldest[2]) + windowMs

          return {
            0,
            0,
            resetTime
          }
        end
      `;

      console.log("Before redis eval");

      const result = (await redis.eval(
        luaScript,
        1,
        key,
        config.windowMs.toString(),
        config.maxRequests.toString(),
        now.toString()
      )) as number[];

      console.log("After redis eval");

      if (result[0] === 1) {
        return {
          allowed: true,
          remaining: Number(result[1]),
          resetTime: Number(result[2]),
        };
      }

      return {
        allowed: false,
        remaining: 0,
        resetTime: Number(result[2]),
      };
    } catch (error) {
      console.error("Rate limit check failed:", error);

      // ======================================================
      // FAIL OPEN
      // ======================================================
      //
      // If Redis is unavailable, allow the request to proceed.
      // This prevents Redis outages from taking down the API.
      //

      return {
        allowed: true,
        remaining: config.maxRequests,
        resetTime: now + config.windowMs,
      };
    }
  }

  async incrementAndCheck(
    identifier: string,
    limitType: string = "default"
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: number;
  }> {
    return this.checkLimit(identifier, limitType);
  }

  async resetLimit(
    identifier: string,
    limitType: string = "default"
  ): Promise<void> {
    const config =
      this.configs.get(limitType) || this.configs.get("default")!;

    const key = `${config.keyPrefix}:${identifier}`;

    await redis.del(key);
  }

  async getRemainingRequests(
    identifier: string,
    limitType: string = "default"
  ): Promise<number> {
    const config =
      this.configs.get(limitType) || this.configs.get("default")!;

    const key = `${config.keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;

    const count = await redis.zcount(
      key,
      windowStart,
      now
    );

    return Math.max(
      0,
      config.maxRequests - count
    );
  }
}

// ============================================================
// RATE LIMITER INSTANCE
// ============================================================

const rateLimiter = new RateLimiter();

// ============================================================
// EXPRESS MIDDLEWARE FACTORY
// ============================================================

export const rateLimitMiddleware = (
  limitType: string = "default"
) => {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    // ========================================================
    // IDENTIFIER
    // ========================================================

    const identifier =
      req.user?.id ||
      req.ip ||
      req.headers["x-forwarded-for"] ||
      "unknown";

    const identifierStr = Array.isArray(identifier)
      ? identifier[0]
      : identifier;

    // ========================================================
    // TIMEOUT PROTECTION
    // ========================================================

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(
          new Error("Rate limit check timeout")
        );
      }, 5000);

      // Prevent timer from keeping Node alive unnecessarily
      if (typeof timer.unref === "function") {
        timer.unref();
      }
    });

    try {
      console.log("Rate limit start");

      // ======================================================
      // CHECK RATE LIMIT
      // ======================================================

      const {
        allowed,
        remaining,
        resetTime,
      } = await Promise.race([
        rateLimiter.incrementAndCheck(
          identifierStr,
          limitType
        ),
        timeoutPromise,
      ]);

      console.log("Rate limit completed");

      // ======================================================
      // RATE LIMIT HEADERS
      // ======================================================

      res.setHeader(
        "X-RateLimit-Remaining",
        remaining
      );

      res.setHeader(
        "X-RateLimit-Reset",
        new Date(resetTime).toISOString()
      );

      // ======================================================
      // BLOCK REQUEST
      // ======================================================

      if (!allowed) {
        const retryAfter = Math.max(
          1,
          Math.ceil(
            (resetTime - Date.now()) / 1000
          )
        );

        res.setHeader(
          "Retry-After",
          retryAfter
        );

        return res.status(429).json({
          error: "Too many requests",
          message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
          retryAfter,
          remaining: 0,
          resetAt: new Date(
            resetTime
          ).toISOString(),
        });
      }

      next();
    } catch (error) {
      console.error(
        "Rate limit error:",
        error
      );

      // ======================================================
      // FAIL OPEN
      // ======================================================
      //
      // Redis failure or timeout should not block the API.
      //

      if (limitType === "payment") {
        console.warn(
          "⚠️ Rate limit failed for payment, allowing request (fail open)"
        );
      }

      next();
    }
  };
};

// ============================================================
// HIGH-PERFORMANCE SLIDING WINDOW
// ============================================================

export const slidingWindowRateLimit = (
  limitType: string = "api"
) => {
  return rateLimitMiddleware(limitType);
};

// ============================================================
// SPECIFIC RATE LIMITERS
// ============================================================

export const authRateLimiter =
  rateLimitMiddleware("auth");

export const paymentRateLimiter =
  rateLimitMiddleware("payment");

export const apiRateLimiter =
  rateLimitMiddleware("api");

export const adminRateLimiter =
  rateLimitMiddleware("admin");

export const withdrawalRateLimiter =
  rateLimitMiddleware("withdrawal");

// ============================================================
// HELPER
// ============================================================

function getMaxRequests(
  limitType: string
): number {
  const limits: Record<string, number> = {
    default: 100,
    auth: 5,
    payment: 10,
    api: 500,
    admin: 200,
    withdrawal: 10,
  };

  return limits[limitType] ?? limits.default;
}