import { Redis } from 'ioredis';
import { Request, Response, NextFunction } from 'express';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  enableOfflineQueue: false,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyPrefix: string;
  skipOnError?: boolean;
}

class RateLimiter {
  private configs: Map<string, RateLimitConfig> = new Map();
  
  constructor() {
    // Pre-configure different rate limits
    this.configs.set('default', {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 100,
      keyPrefix: 'rl:default'
    });
    
    this.configs.set('auth', {
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 5,
      keyPrefix: 'rl:auth'
    });
    
    this.configs.set('payment', {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 10,
      keyPrefix: 'rl:payment'
    });
    
    this.configs.set('api', {
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 500,
      keyPrefix: 'rl:api'
    });
    
    this.configs.set('admin', {
      windowMs: 60 * 1000,
      maxRequests: 200,
      keyPrefix: 'rl:admin'
    });
  }
  
  async checkLimit(
    identifier: string,
    limitType: string = 'default'
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const config = this.configs.get(limitType) || this.configs.get('default');
    const key = `${config.keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    try {
      // Use Lua script for atomic operation
      const luaScript = `
        local key = KEYS[1]
        local windowMs = tonumber(ARGV[1])
        local maxRequests = tonumber(ARGV[2])
        local now = tonumber(ARGV[3])
        
        -- Remove old entries
        redis.call('ZREMRANGEBYSCORE', key, 0, now - windowMs)
        
        -- Get current count
        local current = redis.call('ZCARD', key)
        
        -- Check if allowed
        if current < maxRequests then
          -- Add current request
          redis.call('ZADD', key, now, now)
          redis.call('EXPIRE', key, windowMs / 1000)
          return {1, maxRequests - current - 1, current + 1}
        else
          -- Get oldest request time for reset
          local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
          local resetTime = tonumber(oldest[2]) + windowMs
          return {0, 0, resetTime}
        end
      `;
      
      const result = await redis.eval(
        luaScript,
        1,
        key,
        config.windowMs.toString(),
        config.maxRequests.toString(),
        now.toString()
      ) as any[];
      
      if (result[0] === 1) {
        return {
          allowed: true,
          remaining: result[1],
          resetTime: now + config.windowMs
        };
      } else {
        return {
          allowed: false,
          remaining: 0,
          resetTime: result[2]
        };
      }
    } catch (error) {
      console.error('Rate limit check failed:', error);
      // Fail open on Redis error
      return {
        allowed: true,
        remaining: config.maxRequests,
        resetTime: now + config.windowMs
      };
    }
  }
  
  async incrementAndCheck(
    identifier: string,
    limitType: string = 'default'
  ): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    return this.checkLimit(identifier, limitType);
  }
  
  async resetLimit(identifier: string, limitType: string = 'default') {
    const config = this.configs.get(limitType);
    const key = `${config.keyPrefix}:${identifier}`;
    await redis.del(key);
  }
  
  async getRemainingRequests(identifier: string, limitType: string = 'default'): Promise<number> {
    const config = this.configs.get(limitType);
    const key = `${config.keyPrefix}:${identifier}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    const count = await redis.zcount(key, windowStart, now);
    return Math.max(0, config.maxRequests - count);
  }
}

const rateLimiter = new RateLimiter();

// Express middleware factory
export const rateLimitMiddleware = (limitType: string = 'default') => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Get client identifier
    const identifier = req.user?.id || req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const identifierStr = Array.isArray(identifier) ? identifier[0] : identifier;
    
    // Check rate limit
    const { allowed, remaining, resetTime } = await rateLimiter.incrementAndCheck(
      identifierStr,
      limitType
    );
    
    // Set rate limit headers
      res.setHeader('X-RateLimit-Remaining', remaining);
    res.setHeader('X-RateLimit-Reset', new Date(resetTime).toISOString());
    
    if (!allowed) {
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
      res.setHeader('Retry-After', retryAfter);
      
      return res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Please try again in ${retryAfter} seconds.`,
        retryAfter,
       remaining: 0,
        resetAt: new Date(resetTime).toISOString()
      });
    }
    
    next();
  };
};

// High-performance sliding window counter for API endpoints
export const slidingWindowRateLimit = (limitType: string = 'api') => {
  return rateLimitMiddleware(limitType);
};

// Specific rate limiters for different endpoints
export const authRateLimiter = rateLimitMiddleware('auth');
export const paymentRateLimiter = rateLimitMiddleware('payment');
export const apiRateLimiter = rateLimitMiddleware('api');
export const adminRateLimiter = rateLimitMiddleware('admin');

// Helper function to get max requests for type
function getMaxRequests(limitType: string): number {
  const limits = {
    default: 100,
    auth: 5,
    payment: 10,
    api: 500,
    admin: 200
  };
  return limits[limitType] || limits.default;
}