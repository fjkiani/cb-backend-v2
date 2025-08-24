import { CacheService } from '../../../services/cache/CacheService';
import { ILogger } from '../../../types/logger';
import Redis from 'ioredis';

describe('CacheService Integration', () => {
  let cacheService: CacheService;
  let logger: ILogger;
  let redis: Redis;

  beforeAll(() => {
    logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new Redis(redisUrl);
    cacheService = new CacheService({ redisUrl }, logger);
  });

  afterAll(async () => {
    await redis.quit();
  });

  beforeEach(async () => {
    // Clear test keys before each test
    await redis.del('test-key');
  });

  it('should store and retrieve real article data', async () => {
    const articleData = {
      title: 'Test Article',
      url: 'https://example.com/article',
      text: 'Article content...',
      timestamp: new Date().toISOString()
    };

    // Store data
    await cacheService.set('test-key', articleData, 3600);

    // Retrieve data
    const retrieved = await cacheService.get('test-key');

    expect(retrieved).toEqual(articleData);
  });

  it('should handle TTL correctly', async () => {
    const testData = { test: 'data' };
    const ttl = 2; // 2 seconds

    await cacheService.set('test-key', testData, ttl);

    // Check immediately
    let result = await cacheService.get('test-key');
    expect(result).toEqual(testData);

    // Wait for TTL to expire
    await new Promise(resolve => setTimeout(resolve, (ttl + 1) * 1000));

    // Check after expiry
    result = await cacheService.get('test-key');
    expect(result).toBeNull();
  }, 10000); // Increased timeout for TTL test
}); 