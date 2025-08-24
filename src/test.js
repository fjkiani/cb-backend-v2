// Set up environment variables first
process.env.VITE_SUPABASE_URL = 'https://gpirjathvfoqjurjhdxq.supabase.co';
process.env.VITE_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdwaXJqYXRodmZvcWp1cmpoZHhxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNDU3MTExMywiZXhwIjoyMDUwMTQ3MTEzfQ.M3ST5Hjqe8lOvwYdrnAQdS8YGHUB9zsOTOy-izK0bt0';
process.env.VITE_DIFFBOT_TOKEN = 'a70dd1af6e654f5dbb12f3cd2d1406bb';
process.env.REDIS_URL = 'redis://default:AcvYAAIjcDE2ZjFkNjg5MTE5ZWE0NWJkOWU1NjNiMjZkYWUyMjE0NXAxMA@shining-starfish-52184.upstash.io:6379';

// Also set non-VITE versions
process.env.DB_URL = process.env.VITE_SUPABASE_URL;
process.env.SERVICE_KEY = process.env.VITE_SUPABASE_KEY;
process.env.DIFFBOT_TOKEN = process.env.VITE_DIFFBOT_TOKEN;

import { scrapeNews } from './scraper.js';
import logger from './logger.js';
import { getRedisClient } from './services/redis/redisClient.js';

async function test() {
  try {
    logger.info('Starting test...');
    
    // Clear Redis cache
    const redis = getRedisClient();
    await redis.del('trading-economics-news');
    await redis.del('processed-urls');
    await redis.del('last-processed-timestamp');
    logger.info('Cleared Redis cache');
    
    const articles = await scrapeNews(true); // Force fresh data
    
    // Log each article's date information
    articles.forEach(article => {
      logger.info('Article date info:', {
        title: article.title,
        publishedAt: article.publishedAt,
        parsedDate: new Date(article.publishedAt).toLocaleString(),
        humanReadable: new Date(article.publishedAt).toString()
      });
    });
    
    logger.info('Test completed', {
      totalArticles: articles.length,
      newestArticle: {
        title: articles[0]?.title,
        date: articles[0]?.publishedAt
      },
      oldestArticle: {
        title: articles[articles.length - 1]?.title,
        date: articles[articles.length - 1]?.publishedAt
      }
    });
  } catch (error) {
    logger.error('Test failed:', error);
  }
}

test(); 