import { DiffbotService } from '../../../services/diffbot/DiffbotService';
import { CacheService } from '../../../services/cache/CacheService';
import { ILogger } from '../../../types/logger';
import dotenv from 'dotenv';
import Redis from 'ioredis';

// Load environment variables
dotenv.config();

jest.setTimeout(60000); // Set global timeout to 60 seconds

describe('News Caching Integration', () => {
  let diffbotService: DiffbotService;
  let cacheService: CacheService;
  let logger: ILogger;
  let redis: Redis;

  beforeAll(async () => {
    const diffbotToken = process.env.VITE_DIFFBOT_TOKEN;
    const redisUrl = 'redis://localhost:6379';

    if (!diffbotToken) {
      throw new Error('VITE_DIFFBOT_TOKEN environment variable is missing');
    }

    logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    redis = new Redis(redisUrl);
    
    diffbotService = new DiffbotService({ 
      apiToken: diffbotToken
    }, logger);

    cacheService = new CacheService({
      redisUrl: redisUrl
    }, logger);

    // Clear all test keys
    await redis.del('diffbot:test1', 'diffbot:test2');
  }, 30000); // 30 second timeout for beforeAll

  afterAll(async () => {
    try {
      // Close all Redis connections
      if (redis) {
        await redis.quit();
      }
      // Also close the connection from CacheService
      if (cacheService) {
        await (cacheService as any).redis.quit();
      }
      // Wait a bit to ensure connections are closed
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error('Error closing Redis connections:', error);
    }
  }, 10000); // 10 second timeout for afterAll

  it('should cache Diffbot response and avoid duplicate API calls', async () => {
    // Use a real article URL that exists
    const testUrl = 'https://news.ycombinator.com';
    const cacheKey = `diffbot:test1`;

    // First call - should hit Diffbot API
    const firstCallStart = Date.now();
    const firstResult = await diffbotService.analyze(testUrl);
    const firstCallDuration = Date.now() - firstCallStart;

    // Cache the result
    await cacheService.set(cacheKey, firstResult, 3600);

    // Second call - should hit cache
    const secondCallStart = Date.now();
    const cachedResult = await cacheService.get(cacheKey);
    const secondCallDuration = Date.now() - secondCallStart;

    // Verify results
    expect(cachedResult).toBeDefined();
    expect(cachedResult).toEqual(firstResult);
    expect(secondCallDuration).toBeLessThan(firstCallDuration);

    console.log('API Call Duration:', firstCallDuration, 'ms');
    console.log('Cache Hit Duration:', secondCallDuration, 'ms');
    console.log('Performance Improvement:', 
      Math.round((firstCallDuration - secondCallDuration) / firstCallDuration * 100), '%'
    );
  }, 60000);

  it('should handle cache misses gracefully', async () => {
    const nonExistentKey = 'diffbot:nonexistent';
    const cachedResult = await cacheService.get(nonExistentKey);
    
    expect(cachedResult).toBeNull();
    expect(logger.info).toHaveBeenCalled();
  }, 10000);

  it('should respect cache duration', async () => {
    const testUrl = 'https://news.ycombinator.com';
    const cacheKey = `diffbot:test2`;
    const shortDuration = 2; // 2 seconds

    // Get and cache content
    const content = await diffbotService.analyze(testUrl);
    await cacheService.set(cacheKey, content, shortDuration);
    
    // Verify content is cached
    let cachedContent = await cacheService.get(cacheKey);
    expect(cachedContent).toEqual(content);
    
    // Wait for cache to expire
    await new Promise(resolve => setTimeout(resolve, (shortDuration + 1) * 1000));
    
    // Verify cache has expired
    cachedContent = await cacheService.get(cacheKey);
    expect(cachedContent).toBeNull();
  }, 30000);
});