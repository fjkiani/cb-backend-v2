import Redis from 'ioredis';
import { ILogger } from '../../types/logger';

interface CacheServiceConfig {
  redisUrl?: string;
  ttl?: number;
}

export class CacheService {
  private redis: Redis;
  private logger: ILogger;
  private defaultTTL: number;

  constructor(config: CacheServiceConfig, logger: ILogger) {
    this.redis = new Redis(config.redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
    this.logger = logger;
    this.defaultTTL = config.ttl || 3600; // 1 hour default

    this.redis.on('error', (err) => {
      this.logger.error('Redis error:', err);
    });

    this.redis.on('connect', () => {
      this.logger.info('Redis connected successfully');
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      this.logger.error('Error getting cache:', error);
      return null;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    try {
      const serializedValue = JSON.stringify(value);
      if (ttl) {
        await this.redis.set(key, serializedValue, 'EX', ttl);
      } else {
        await this.redis.set(key, serializedValue, 'EX', this.defaultTTL);
      }
    } catch (error) {
      this.logger.error('Error setting cache:', error);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.error('Error deleting cache:', error);
    }
  }

  async close(): Promise<void> {
    try {
      await this.redis.quit();
    } catch (error) {
      this.logger.error('Error closing Redis connection:', error);
    }
  }
} 