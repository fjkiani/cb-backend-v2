import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from '../../../logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env files
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../../.env.local') });

async function main() {
  try {
    // Check environment variables
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      logger.error('Missing Supabase credentials');
      process.exit(1);
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseKey);
    logger.info('Supabase client initialized');

    // Get total count of articles
    const { count } = await supabase
      .from('articles')
      .select('*', { count: 'exact', head: true });

    logger.info('Total articles in database:', { count });

    // Get latest articles
    const { data: articles, error } = await supabase
      .from('articles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      throw error;
    }

    // Log article details
    articles.forEach((article, index) => {
      logger.info(`Article ${index + 1}:`, {
        title: article.title,
        created_at: article.created_at,
        published_at: article.published_at,
        raw_data: article.raw_data
      });
    });

    process.exit(0);
  } catch (error) {
    logger.error('Test failed:', error);
    process.exit(1);
  }
}

main();
