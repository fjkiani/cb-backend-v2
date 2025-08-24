import { getRedisClient } from '../../../services/redis/redisClient.js';
import { scrapeNews } from '../../../scraper.js';
import logger from '../../../logger.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env files
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env.local') });

async function main() {
  try {
    // Check for Diffbot token
    const diffbotToken = process.env.DIFFBOT_TOKEN || process.env.VITE_DIFFBOT_TOKEN;
    if (!diffbotToken) {
      logger.error('Diffbot token not found in environment variables');
      process.exit(1);
    }
    logger.info('Found Diffbot token');

    // Initialize Redis client
    const redis = getRedisClient();
    logger.info('Redis client initialized');

    // Clear Redis cache
    await redis.del('trading-economics-news');
    await redis.del('last-processed-timestamp');
    await redis.del('processed-urls');
    logger.info('Redis cache cleared');

    // Force fresh scrape
    logger.info('Starting fresh scrape...');
    const articles = await scrapeNews(true);
    
    // Log results
    logger.info('Fresh scrape completed', {
      totalArticles: articles.length,
      firstArticle: {
        title: articles[0]?.title,
        date: articles[0]?.publishedAt,
        originalDate: articles[0]?.originalDate
      },
      lastArticle: {
        title: articles[articles.length - 1]?.title,
        date: articles[articles.length - 1]?.publishedAt,
        originalDate: articles[articles.length - 1]?.originalDate
      }
    });

    process.exit(0);
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

main();