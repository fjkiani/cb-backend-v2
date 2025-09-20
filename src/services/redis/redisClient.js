import Redis from 'ioredis';
import logger from '../../logger.js';

// In-memory cache fallback for when Redis is not available
class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.ttl = new Map();
  }

  async get(key) {
    const ttl = this.ttl.get(key);
    if (ttl && Date.now() > ttl) {
      this.cache.delete(key);
      this.ttl.delete(key);
      return null;
    }
    return this.cache.get(key) || null;
  }

  async set(key, value, ttlSeconds = 3600) {
    this.cache.set(key, value);
    this.ttl.set(key, Date.now() + (ttlSeconds * 1000));
  }

  async del(key) {
    this.cache.delete(key);
    this.ttl.delete(key);
  }

  async quit() {
    this.cache.clear();
    this.ttl.clear();
  }
}

// Redis configuration
const redisConfig = process.env.REDIS_URL ? {
  url: process.env.REDIS_URL,
  tls: { rejectUnauthorized: false },
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError: function(err) {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true;
    }
    return false;
  }
} : {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
};

let redisClient = null;
let isRedisAvailable = false;

export function getRedisClient() {
  if (!redisClient) {
    // Check if we have a valid Redis URL
    if (process.env.REDIS_URL && process.env.REDIS_URL.startsWith('redis://') && !process.env.REDIS_URL.includes('default.upstash.io')) {
      try {
        logger.info('Initializing Redis client with config:', {
          url: process.env.REDIS_URL ? 'Using REDIS_URL' : 'localhost:6379',
          usingTLS: !!redisConfig.tls
        });
        
        redisClient = new Redis(redisConfig);

        redisClient.on('error', (err) => {
          logger.error('Redis error:', {
            message: err.message,
            code: err.code,
            command: err.command,
            stack: err.stack
          });
          isRedisAvailable = false;
          // Switch to in-memory cache on error
          redisClient = new MemoryCache();
        });

        redisClient.on('connect', () => {
          logger.info('Redis connected successfully');
          isRedisAvailable = true;
        });

        redisClient.on('reconnecting', () => {
          logger.info('Redis reconnecting...');
          isRedisAvailable = false;
        });

        redisClient.on('ready', () => {
          logger.info('Redis client is ready');
          isRedisAvailable = true;
        });

        // Test connection with timeout
        Promise.race([
          redisClient.ping(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Redis connection timeout')), 5000))
        ]).then(() => {
          isRedisAvailable = true;
        }).catch((error) => {
          logger.warn('Redis connection failed, falling back to in-memory cache:', error.message);
          isRedisAvailable = false;
          redisClient = new MemoryCache();
        });

      } catch (error) {
        logger.error('Failed to initialize Redis client:', error);
        isRedisAvailable = false;
        redisClient = new MemoryCache();
      }
    } else {
      logger.warn('No valid Redis URL found or using fake URL, using in-memory cache fallback');
      isRedisAvailable = false;
      redisClient = new MemoryCache();
    }
  }
  return redisClient;
}

export async function cleanup() {
  try {
    if (redisClient) {
      logger.info('Closing Redis connection...');
      await redisClient.quit();
      redisClient = null;
      logger.info('Redis connection closed successfully');
    }
  } catch (error) {
    logger.error('Error closing Redis connection:', error);
    throw error;
  }
}
