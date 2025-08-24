import { getRedisClient } from './redisClient';
import { ILogger } from '../../types/logger';

export class CacheService {
  private redis;
  private logger: ILogger;

  constructor(logger: ILogger) {
    this.redis = getRedisClient();
    this.logger = logger;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.error('Cache get error:', error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      await this.redis.setex(key, ttlSeconds, serialized);
    } catch (error) {
      this.logger.error('Cache set error:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.error('Cache delete error:', error instanceof Error ? error.message : 'Unknown error');
    }
  }
} 