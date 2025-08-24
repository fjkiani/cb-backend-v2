import { NewsScraper } from '../pythonScraper.js';
import logger from '../../../logger.js';
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from test env file
const envPath = path.resolve(__dirname, '../../../../.env.test');
logger.info('Loading test environment from:', envPath);
config({ path: envPath });

async function testDiffbotFlow() {
  try {
    // Verify environment variables
    if (!process.env.DIFFBOT_TOKEN) {
      throw new Error('DIFFBOT_TOKEN environment variable is required');
    }

    const scraper = new NewsScraper();

    logger.info('=== First Run ===');
    logger.info('This should detect new content and process with Diffbot');
    await scraper.checkForNewNews();

    // Wait a bit before second run
    await new Promise(resolve => setTimeout(resolve, 2000));

    logger.info('\n=== Second Run ===');
    logger.info('This should detect no new content');
    await scraper.checkForNewNews();

    // Force a different title to test Diffbot processing
    logger.info('\n=== Forced New Content Run ===');
    await testWithMockContent(scraper);

  } catch (error) {
    logger.error('Test failed:', error);
  }
}

async function testWithMockContent(scraper: NewsScraper) {
  try {
    // Test Diffbot analysis directly
    const testUrl = 'https://tradingeconomics.com/united-states/news';
    const testTitle = 'Test Market Update ' + new Date().toISOString();

    logger.info('Testing Diffbot analysis with:', {
      url: testUrl,
      title: testTitle
    });

    const article = await scraper['analyzeDiffbot'](testUrl, testTitle);
    
    logger.info('Diffbot analysis result:', {
      title: article.title,
      contentLength: article.content?.length,
      sentiment: article.sentiment,
      publishedAt: article.publishedAt
    });

  } catch (error) {
    logger.error('Mock content test failed:', error);
  }
}

// Run the test
testDiffbotFlow(); 