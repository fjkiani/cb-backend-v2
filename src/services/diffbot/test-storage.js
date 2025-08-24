import { SupabaseStorage } from '../storage/supabase/supabaseStorage.js';
import logger from '../../logger.js';
import dotenv from 'dotenv';

// Use absolute path to .env.local
const envPath = '/Users/fahadkiani/Desktop/development/project/.env.local';
console.log('Loading env from:', envPath);

// Load environment variables
const result = dotenv.config({ path: envPath });
console.log('Env loading result:', result.error ? 'Error' : 'Success');

// Debug: Check environment variables
console.log('Environment check:', {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ? 'Found' : 'Missing',
  VITE_SUPABASE_KEY: process.env.VITE_SUPABASE_KEY ? 'Found' : 'Missing',
  SUPABASE_URL: process.env.SUPABASE_URL ? 'Found' : 'Missing',
  SUPABASE_KEY: process.env.SUPABASE_KEY ? 'Found' : 'Missing',
  DB_URL: process.env.DB_URL ? 'Found' : 'Missing',
  SERVICE_KEY: process.env.SERVICE_KEY ? 'Found' : 'Missing',
  envPath,
  cwd: process.cwd()
});

async function testStorage() {
  try {
    console.log('Creating Supabase storage...');
    const storage = new SupabaseStorage();
    
    // Test article data from our last scrape
    const testArticle = {
      title: "US 10-Year Yield Rises Toward 7-Month High",
      content: "The yield on the 10-year US Treasury note rose to above the 4.55% threshold...",
      url: "https://tradingeconomics.com/united-states/government-bond-yield",
      publishedAt: new Date().toISOString(),
      source: "Trading Economics",
      sentiment: {
        score: 0.191,
        label: "positive",
        confidence: 0.191
      }
    };

    console.log('Storing test article...');
    const stored = await storage.storeArticle(testArticle);
    console.log('Stored article:', stored);

    console.log('Querying recent articles...');
    const articles = await storage.getRecentArticles(5);
    console.log('Recent articles:', {
      count: articles.length,
      newest: articles[0] ? {
        title: articles[0].title,
        published_at: articles[0].published_at,
        url: articles[0].url
      } : null
    });

  } catch (error) {
    console.error('Storage test failed:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      details: error.details
    });
  }
}

testStorage(); 