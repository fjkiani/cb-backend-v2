// src/scripts/test-news-flow.ts
import { NewsScraper } from '../src/services/diffbot/pythonScraper';
import logger from '../../backend/src/logger';

async function testNewsFlow() {
  const scraper = new NewsScraper();
  
  try {
    logger.info('Starting news flow test...');
    
    // Run the scraper
    await scraper.checkForNewNews();
    
    logger.info('News flow test completed successfully');
  } catch (error) {
    logger.error('News flow test failed:', error);
  }
}

// Run if called directly
if (require.main === module) {
  testNewsFlow();
}