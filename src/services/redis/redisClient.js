import Redis from 'ioredis';
import logger from '../../logger.js';

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

export function getRedisClient() {
  if (!redisClient) {
    logger.info('Initializing Redis client with config:', {
      url: process.env.REDIS_URL ? 'Using REDIS_URL (Upstash)' : 'localhost:6379',
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
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected successfully');
    });

    redisClient.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });

    redisClient.on('ready', () => {
      logger.info('Redis client is ready');
    });
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
