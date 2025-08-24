import { SupabaseStorage } from '../../../services/storage/supabase/supabaseStorage.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get absolute path to .env.local
const envPath = '/Users/fahadkiani/Desktop/development/project/.env.local';
console.log('Loading env from:', envPath);

// Load environment variables
const result = dotenv.config({ path: envPath });
console.log('Env loading result:', result.error ? 'Error' : 'Success');

// Debug: Check environment variables
console.log('Environment check:', {
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL ? 'Found' : 'Missing',
  VITE_SUPABASE_KEY: process.env.VITE_SUPABASE_KEY ? 'Found' : 'Missing',
  envPath,
  cwd: process.cwd()
});

async function testStorage() {
  try {
    console.log('Creating Supabase storage...');
    const storage = new SupabaseStorage();
    
    // Create a test article with today's date
    const testArticle = {
      title: `Test Article ${new Date().toISOString()}`,
      content: 'This is a test article content',
      url: `https://test.com/article/${Date.now()}`,
      date: new Date().toUTCString(),
      publishedAt: new Date().toISOString(),
      created_at: new Date().toISOString(),
      source: 'Test Source',
      category: 'Test Category'
    };

    console.log('\nAttempting to store test article:', {
      title: testArticle.title,
      date: testArticle.date,
      publishedAt: testArticle.publishedAt
    });

    // Try storing the article
    const storedArticle = await storage.storeArticle(testArticle);
    console.log('\nArticle stored successfully:', {
      id: storedArticle.id,
      title: storedArticle.title,
      created_at: storedArticle.created_at,
      published_at: storedArticle.published_at,
      raw_data: storedArticle.raw_data
    });

    // Query to verify the article was stored
    console.log('\nQuerying for recently stored article...');
    const { data, error } = await storage.supabase
      .from('articles')
      .select('*')
      .eq('url', testArticle.url)
      .single();

    if (error) throw error;

    console.log('Retrieved article:', {
      id: data.id,
      title: data.title,
      created_at: data.created_at,
      published_at: data.published_at,
      raw_data_date: data.raw_data?.date
    });

    // Query recent articles to verify ordering
    console.log('\nChecking most recent articles...');
    const { data: recentArticles, error: recentError } = await storage.supabase
      .from('articles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (recentError) throw recentError;
    
    console.log('Recent articles:', recentArticles.map(article => ({
      title: article.title,
      created_at: article.created_at,
      published_at: article.published_at,
      raw_data_date: article.raw_data?.date
    })));

  } catch (error) {
    console.error('Storage test failed:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

testStorage();
