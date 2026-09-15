 // src/modules/social-v2/utils/social-cache.ts
import redis from "../../../config/redis";
import { SOCIAL } from "../social.constants";

export class SocialCache {
  private static prefix = "social:";

  static async get<T>(key: string): Promise<T | null> {
    try {
      const data = await redis.get(`${this.prefix}${key}`);
      if (!data) return null;
      return JSON.parse(data.toString());
    } catch {
      return null;
    }
  }

  static async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const data = JSON.stringify(value);
      if (ttl) {
        await redis.setex(`${this.prefix}${key}`, ttl, data);
      } else {
        await redis.set(`${this.prefix}${key}`, data);
      }
    } catch (error) {
      console.error("Cache set error:", error);
    }
  }

  static async del(key: string): Promise<void> {
    try {
      await redis.del(`${this.prefix}${key}`);
    } catch (error) {
      console.error("Cache delete error:", error);
    }
  }

  static async delPattern(pattern: string): Promise<void> {
    try {
      const keys = await redis.keys(`${this.prefix}${pattern}`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } catch (error) {
      console.error("Cache delete pattern error:", error);
    }
  }

  // User cache
  static async cacheUser(userId: string, data: any): Promise<void> {
    await this.set(`user:${userId}`, data, SOCIAL.CACHE.USER_PROFILE_TTL);
  }

  static async getUser(userId: string): Promise<any> {
    return this.get(`user:${userId}`);
  }

  // Feed cache
  static async cacheFeed(userId: string, feed: any[]): Promise<void> {
    await this.set(`feed:${userId}`, feed, SOCIAL.CACHE.FEED_TTL);
  }

  static async getFeed(userId: string): Promise<any[]> {
    return this.get(`feed:${userId}`);
  }

  // Story cache
  static async cacheStories(userId: string, stories: any[]): Promise<void> {
    await this.set(`stories:${userId}`, stories, SOCIAL.CACHE.STORY_TTL);
  }

  static async getStories(userId: string): Promise<any[]> {
    return this.get(`stories:${userId}`);
  }

  // User presence
  static async setOnline(userId: string, socketId: string): Promise<void> {
    await redis.setex(
      `${SOCIAL.REDIS.USER_ONLINE}${userId}`,
      120,
      socketId
    );
  }

  static async isOnline(userId: string): Promise<boolean> {
    const data = await redis.get(`${SOCIAL.REDIS.USER_ONLINE}${userId}`);
    return !!data;
  }

  static async removeOnline(userId: string): Promise<void> {
    await redis.del(`${SOCIAL.REDIS.USER_ONLINE}${userId}`);
  }
}