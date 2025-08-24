import { scrapeNews, cleanup } from '../../scraper.js';
import logger from '../../logger.js';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.resolve(__dirname, '../../../../.env.local');
config({ path: envPath });

async function runTest() {
  try {
    // Verify environment variables
    if (!process.env.DIFFBOT_TOKEN) {
      throw new Error('DIFFBOT_TOKEN environment variable is required');
    }

    logger.info('=== First Run ===');
    logger.info('This should get all new articles');
    const firstRun = await scrapeNews();
    logger.info('First run results:', {
      articleCount: firstRun.length,
      firstArticle: firstRun[0],
      lastArticle: firstRun[firstRun.length - 1]
    });

    // Wait a bit before second run
    await new Promise(resolve => setTimeout(resolve, 2000));

    logger.info('\n=== Second Run ===');
    logger.info('This should skip previously processed articles');
    const secondRun = await scrapeNews();
    logger.info('Second run results:', {
      articleCount: secondRun.length,
      firstArticle: secondRun[0],
      lastArticle: secondRun[secondRun.length - 1]
    });

    // Force refresh to test cache
    await new Promise(resolve => setTimeout(resolve, 2000));

    logger.info('\n=== Force Refresh Run ===');
    logger.info('This should still respect timestamp/URL deduplication');
    const forceRun = await scrapeNews(true);
    logger.info('Force refresh results:', {
      articleCount: forceRun.length,
      firstArticle: forceRun[0],
      lastArticle: forceRun[forceRun.length - 1]
    });

  } catch (error) {
    logger.error('Test failed:', error);
  } finally {
    await cleanup();
  }
}

runTest(); 