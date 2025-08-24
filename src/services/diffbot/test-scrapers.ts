import { scrapeNews } from '../../scraper.js';
import { NewsScraper } from './pythonScraper.js';
import logger from '../../logger.js';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
const envPath = path.resolve(__dirname, '../../../../.env.local');
config({ path: envPath });

async function testScrapers() {
  try {
    logger.info('=== Testing All Scrapers ===');

    // 1. First test Python scraper directly
    logger.info('\n1. Testing Python Scraper');
    const pythonScraper = new NewsScraper();
    const pythonResult = await pythonScraper.checkForNewNews();
    logger.info('Python scraper result:', {
      hasNewContent: pythonResult,
      lastProcessedTitle: pythonScraper['lastProcessedTitle']
    });

    // 2. Test main scraper with force refresh
    logger.info('\n2. Testing Main Scraper (Force Refresh)');
    const forcedArticles = await scrapeNews(true);
    logger.info('Forced refresh results:', {
      articleCount: forcedArticles.length,
      firstArticle: forcedArticles[0]?.title,
      lastArticle: forcedArticles[forcedArticles.length - 1]?.title
    });

    // 3. Test cache behavior
    logger.info('\n3. Testing Cache Behavior');
    const cachedArticles = await scrapeNews(false);
    logger.info('Cached results:', {
      articleCount: cachedArticles.length,
      firstArticle: cachedArticles[0]?.title,
      lastArticle: cachedArticles[cachedArticles.length - 1]?.title,
      isSameAsForced: cachedArticles.length === forcedArticles.length
    });

    // 4. Wait and test for new content
    logger.info('\n4. Testing New Content Detection');
    await new Promise(resolve => setTimeout(resolve, 5000));
    const hasNewContent = await pythonScraper.checkForNewNews();
    logger.info('New content check:', {
      hasNewContent
    });

    if (hasNewContent) {
      logger.info('New content detected, running main scraper');
      const newArticles = await scrapeNews(false);
      logger.info('New content results:', {
        articleCount: newArticles.length,
        firstArticle: newArticles[0]?.title,
        isDifferent: newArticles[0]?.title !== forcedArticles[0]?.title
      });
    }

    // 5. Verify Diffbot integration
    logger.info('\n5. Verifying Diffbot Integration');
    const diffbotFields = forcedArticles[0] ? {
      hasContent: !!forcedArticles[0].content,
      hasSummary: !!forcedArticles[0].summary,
      hasSentiment: !!forcedArticles[0].sentiment_score,
      hasPublishedAt: !!forcedArticles[0].published_at
    } : null;
    logger.info('Diffbot field verification:', diffbotFields);

  } catch (error) {
    logger.error('Test failed:', error);
  }
}

// Add cleanup function
async function cleanup() {
  // Add any cleanup code here
  process.exit(0);
}

// Run tests
testScrapers().then(cleanup); 