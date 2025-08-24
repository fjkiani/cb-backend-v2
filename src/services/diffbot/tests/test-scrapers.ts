import { scrapeNews } from '../../../scraper.js';
import { NewsScraper } from '../pythonScraper.js';
import logger from '../../../logger.js';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import type { ScrapedArticle } from '../../../scraper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from test env file
const envPath = path.resolve(__dirname, '../../../../.env.test');
logger.info('Loading test environment from:', envPath);
config({ path: envPath });

// Verify environment variables are loaded
logger.info('Environment check:', {
  hasSupabaseUrl: !!process.env.VITE_SUPABASE_URL,
  hasSupabaseKey: !!process.env.VITE_SUPABASE_KEY,
  hasDiffbotToken: !!process.env.DIFFBOT_TOKEN,
  hasCohereKey: !!process.env.COHERE_API_KEY
});

async function testScrapers() {
  try {
    logger.info('=== Testing All Scrapers ===');

    // 1. First test Python scraper directly
    logger.info('\n1. Testing Python Scraper');
    const pythonScraper = new NewsScraper({ mock: true });
    const pythonResult = await pythonScraper.checkForNewNews();
    logger.info('Python scraper result:', {
      hasNewContent: pythonResult,
      lastProcessedTitle: pythonScraper['lastProcessedTitle']
    });

    // 2. Test main scraper with force refresh (mock mode)
    logger.info('\n2. Testing Main Scraper (Force Refresh)');
    const forcedArticles: ScrapedArticle[] = await scrapeNews(true, { 
      mock: true,
      mockCohere: true,
      mockDiffbot: true 
    });
    logger.info('Forced refresh results:', {
      articleCount: forcedArticles.length,
      firstArticle: forcedArticles[0]?.title,
      isMockData: forcedArticles[0]?.title === 'Test Market Update'
    });

    // 3. Test cache behavior (mock mode)
    logger.info('\n3. Testing Cache Behavior');
    const cachedArticles: ScrapedArticle[] = await scrapeNews(false, { 
      mock: true,
      mockCohere: true,
      mockDiffbot: true 
    });
    logger.info('Cached results:', {
      articleCount: cachedArticles.length,
      firstArticle: cachedArticles[0]?.title,
      isSameAsForced: cachedArticles.length === forcedArticles.length
    });

    // 4. Wait and test for new content (mock mode)
    logger.info('\n4. Testing New Content Detection');
    await new Promise(resolve => setTimeout(resolve, 1000));
    const hasNewContent = await pythonScraper.checkForNewNews();
    logger.info('New content check:', {
      hasNewContent
    });

    if (hasNewContent) {
      logger.info('New content detected, running main scraper');
      const newArticles = await scrapeNews(false, { mock: true });
      logger.info('New content results:', {
        articleCount: newArticles.length,
        firstArticle: newArticles[0]?.title,
        isDifferent: newArticles[0]?.title !== forcedArticles[0]?.title
      });
    }

    // 5. Verify mock data structure
    logger.info('\n5. Verifying Mock Data Structure');
    const mockDataFields = forcedArticles[0] ? {
      hasTitle: !!forcedArticles[0].title,
      hasContent: !!forcedArticles[0].content,
      hasSummary: !!forcedArticles[0].summary,
      hasSentimentScore: !!forcedArticles[0].sentiment_score,
      hasPublishedAt: !!forcedArticles[0].published_at,
      isTestData: forcedArticles[0].title === 'Test Market Update'
    } : null;
    logger.info('Mock data verification:', mockDataFields);

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