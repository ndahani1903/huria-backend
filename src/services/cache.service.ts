import { Redis } from 'ioredis';
import crypto from 'crypto';

interface CacheOptions {
  ttl?: number;
  staleWhileRevalidate?: number;
  tags?: string[];
  compression?: boolean;
}

class CacheService {
  private redis: Redis;
  private readonly DEFAULT_TTL = 300; // 5 minutes
  private readonly COMPRESSION_THRESHOLD = 1024; // 1KB
  private cacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    evictions: 0
  };
  
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD,
      enableOfflineQueue: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    });
    
    this.setupEvictionMonitoring();
  }
  
  async get<T>(key: string): Promise<T | null> {
    try {
      const data = await this.redis.get(key);
      
      if (!data) {
        this.cacheStats.misses++;
        return null;
      }
      
      this.cacheStats.hits++;
      
      // Check if data is compressed
      const isCompressed = data.startsWith('COMPRESSED:');
      let parsed: any;
      
      if (isCompressed) {
        const compressed = data.substring(11);
        const decompressed = await this.decompress(compressed);
        parsed = JSON.parse(decompressed);
      } else {
        parsed = JSON.parse(data);
      }
      
      // Check for stale-while-revalidate
      if (parsed.__staleAt && Date.now() > parsed.__staleAt) {
        this.triggerBackgroundRefresh(key);
      }
      
      return parsed.__data || parsed;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }
  
  async set(key: string, value: any, options: CacheOptions = {}): Promise<void> {
    try {
      const ttl = options.ttl || this.DEFAULT_TTL;
      const staleTtl = options.staleWhileRevalidate || ttl * 2;
      
      let dataToStore: any = {
        __data: value,
        __cachedAt: Date.now()
      };
      
      if (options.staleWhileRevalidate) {
        dataToStore.__staleAt = Date.now() + (ttl * 1000);
      }
      
      let serialized = JSON.stringify(dataToStore);
      
      // Compress if large
      if (serialized.length > this.COMPRESSION_THRESHOLD && options.compression !== false) {
        const compressed = await this.compress(serialized);
        serialized = `COMPRESSED:${compressed}`;
      }
      
      // Set with expiration
      await this.redis.setex(key, staleTtl, serialized);
      
      // Store tags for invalidation
      if (options.tags && options.tags.length > 0) {
        await this.tagKey(key, options.tags);
      }
      
      this.cacheStats.sets++;
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }
  
  async delete(key: string): Promise<void> {
    await this.redis.del(key);
    await this.removeKeyTags(key);
  }
  
  async invalidateByTag(tag: string): Promise<void> {
    const keys = await this.redis.smembers(`tag:${tag}`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
      await this.redis.del(`tag:${tag}`);
      this.cacheStats.evictions += keys.length;
    }
  }
  
  async invalidateByPattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
      this.cacheStats.evictions += keys.length;
    }
  }
  
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }
    
    const fresh = await fetcher();
    await this.set(key, fresh, options);
    return fresh;
  }
  
  async getMany<T>(keys: string[]): Promise<(T | null)[]> {
    const pipeline = this.redis.pipeline();
    keys.forEach(key => pipeline.get(key));
    const results = await pipeline.exec();
    
    return results.map(([err, data]) => {
      if (err || !data) return null;
      try {
        const parsed = JSON.parse(data as string);
        return parsed.__data || parsed;
      } catch {
        return null;
      }
    });
  }
  
  async setMany(items: Array<{ key: string; value: any; options?: CacheOptions }>): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    for (const item of items) {
      const ttl = item.options?.ttl || this.DEFAULT_TTL;
      const serialized = JSON.stringify({
        __data: item.value,
        __cachedAt: Date.now()
      });
      pipeline.setex(item.key, ttl, serialized);
    }
    
    await pipeline.exec();
  }
  
  async increment(key: string, delta: number = 1): Promise<number> {
    return this.redis.incrby(key, delta);
  }
  
  async expire(key: string, seconds: number): Promise<void> {
    await this.redis.expire(key, seconds);
  }
  
  private async tagKey(key: string, tags: string[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    for (const tag of tags) {
      pipeline.sadd(`tag:${tag}`, key);
      pipeline.expire(`tag:${tag}`, 86400); // 24 hours
    }
    await pipeline.exec();
  }
  
  private async removeKeyTags(key: string): Promise<void> {
    const tags = await this.redis.keys(`tag:*`);
    const pipeline = this.redis.pipeline();
    for (const tag of tags) {
      pipeline.srem(tag, key);
    }
    await pipeline.exec();
  }
  
  private async compress(data: string): Promise<string> {
    // Use built-in compression or implement your own
    // For production, use zlib or similar
    return Buffer.from(data).toString('base64');
  }
  
  private async decompress(data: string): Promise<string> {
    return Buffer.from(data, 'base64').toString();
  }
  
  private triggerBackgroundRefresh(key: string): void {
    // Implement background refresh logic
    setImmediate(async () => {
      // This would call a refresh function if registered
      console.log(`Background refreshing: ${key}`);
    });
  }
  
  private setupEvictionMonitoring(): void {
    setInterval(() => {
      console.log('Cache Stats:', this.cacheStats);
    }, 60000);
  }
  
  async getStats() {
    const info = await this.redis.info();
    return {
      ...this.cacheStats,
      redisInfo: info,
      hitRate: this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) || 0
    };
  }
  
  async warmupCache(keys: Array<{ key: string; fetcher: () => Promise<any>; ttl?: number }>): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    for (const item of keys) {
      try {
        const data = await item.fetcher();
        const serialized = JSON.stringify({
          __data: data,
          __cachedAt: Date.now()
        });
        pipeline.setex(item.key, item.ttl || this.DEFAULT_TTL, serialized);
      } catch (error) {
        console.error(`Failed to warmup cache for key ${item.key}:`, error);
      }
    }
    
    await pipeline.exec();
    console.log(`Cache warmed up with ${keys.length} keys`);
  }
}

export const cacheService = new CacheService();