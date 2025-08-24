import { DiffbotService } from '../../../services/diffbot/DiffbotService';
import { ILogger } from '../../../types/logger';
import dotenv from 'dotenv';

dotenv.config();

const logger: ILogger = {
  info: console.log,
  error: console.error,
  warn: console.warn,
  debug: console.log
};

async function testNewsFetch() {
  try {
    const diffbotToken = process.env.VITE_DIFFBOT_TOKEN;
    if (!diffbotToken) {
      throw new Error('VITE_DIFFBOT_TOKEN environment variable is missing');
    }

    const diffbot = new DiffbotService({ 
      apiToken: diffbotToken
    }, logger);

    // Test URL - replace with your actual news URL
    const testUrl = 'https://tradingeconomics.com/united-states/news';
    
    console.log('Fetching article from:', testUrl);
    const result = await diffbot.analyze(testUrl);
    
    console.log('Diffbot Response:', JSON.stringify(result, null, 2));
    
    if (result.objects && result.objects.length > 0) {
      console.log('\nFirst article details:');
      console.log('Title:', result.objects[0].title);
      console.log('Date:', result.objects[0].date);
      console.log('Published At:', result.objects[0].publishedAt);
      console.log('Created At:', result.objects[0].created_at);
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testNewsFetch(); 