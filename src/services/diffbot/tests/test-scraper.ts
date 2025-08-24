import { scrapeNews } from '../../../scraper.js';
import logger from '../../../logger.js';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.resolve(__dirname, '../../../../../.env.local');
config({ path: envPath });

async function testScraper() {
  try {
    logger.info('Testing scraper...');
    const articles = await scrapeNews(true);
    logger.info('Scrape results:', {
      articleCount: articles.length,
      firstArticle: articles[0]?.title,
      lastArticle: articles[articles.length - 1]?.title
    });
  } catch (error) {
    logger.error('Test failed:', error);
  }
}

testScraper(); 