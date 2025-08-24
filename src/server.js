import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import { NewsScheduler } from './services/news/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });
// Also try loading from root directory as fallback
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// --- Dotenv Debug --- 
// console.log('[Dotenv Debug] Attempting to read REAL_TIME_NEWS_API_KEY.');
// console.log(`[Dotenv Debug] Value found: ${process.env.REAL_TIME_NEWS_API_KEY}`);
// if (!process.env.REAL_TIME_NEWS_API_KEY) {
//   console.error('[Dotenv Debug] REAL_TIME_NEWS_API_KEY is UNDEFINED or EMPTY after dotenv.config()');
// } else {
//   console.log('[Dotenv Debug] REAL_TIME_NEWS_API_KEY seems loaded correctly.');
// }
// --- End Dotenv Debug ---

// Environment variables are loaded from .env file above
// Set fallback values for deployed environments
process.env.CRON_TOKEN = process.env.CRON_TOKEN || '56f52b6634a410679d99bd631000ae6782a786a71e21e3f2494a36adac0d8e3f';

// Set non-VITE versions for consistency
process.env.DB_URL = process.env.DB_URL || process.env.VITE_SUPABASE_URL;
process.env.SERVICE_KEY = process.env.SERVICE_KEY || process.env.VITE_SUPABASE_KEY;
process.env.DIFFBOT_TOKEN = process.env.DIFFBOT_TOKEN || process.env.VITE_DIFFBOT_TOKEN;
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// Debug environment loading
// console.log('Environment loaded:', {
//   envKeys: Object.keys(process.env).filter(key => 
//     key.includes('SUPABASE') || 
//     key.includes('DB_') || 
//     key.includes('SERVICE_') ||
//     key.includes('REDIS') ||
//     key.includes('VITE_') ||
//     key.includes('COHERE')
//   ),
//   supabase: {
//     hasUrl: !!process.env.VITE_SUPABASE_URL,
//     hasKey: !!process.env.VITE_SUPABASE_KEY,
//     urlStart: process.env.VITE_SUPABASE_URL?.substring(0, 20) + '...',
//   },
//   cohere: {
//     hasKey: !!process.env.COHERE_API_KEY
//   }
// });

// Now import the rest of the modules
import express from 'express';
import cors from 'cors';
// Note: Avoid static import of scraper in serverless to prevent import-time failures
// We will dynamically import it inside the route handler when needed
import logger from './logger.js';
import config from './config.js';
import { initializeRoutes as initNewsRoutes } from './routes/news.js';
import analysisRoutes from './routes/analysis.js';
import axios from 'axios';
// Removed static import - will be imported dynamically to avoid cold start issues
import realTimeNewsRoutes from './routes/realTimeNewsRoutes.js';
import diffbotRoutes from './routes/diffbotRoutes.js';
import calendarRoutes from './routes/calendarRoutes.js';
import contextRoutes from './routes/contextRoutes.js';
import scheduleRoutes from './routes/scheduleRoutes.js';

const app = express();
let scheduler;

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      redis: !!process.env.REDIS_URL,
      supabase: !!process.env.VITE_SUPABASE_URL,
      diffbot: !!process.env.VITE_DIFFBOT_TOKEN
    }
  });
});

// Initialize services lazily to avoid cold start issues in Vercel
let storage;

// Lazy initialization function
async function getStorage() {
  if (!storage) {
    try {
      const { SupabaseStorage } = await import('./services/storage/supabase/supabaseStorage.js');
      storage = new SupabaseStorage();
      logger.info('SupabaseStorage initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize SupabaseStorage:', error);
      throw error;
    }
  }
  return storage;
}

// Start the scheduler only in non-Vercel environments
if (!process.env.VERCEL) {
  scheduler = new NewsScheduler();
  scheduler.start();
  logger.info('News scheduler started');
}

// Configure CORS
app.use(cors({
  origin: config.CORS.ORIGINS,
  methods: config.CORS.METHODS,
  credentials: true
}));

// Add body parser for JSON
app.use(express.json());

// Initialize routes - storage will be initialized lazily inside route handlers
const newsRouter = initNewsRoutes(null); // Pass null, routes will get storage when needed
app.use('/api/news', newsRouter);

// Add analysis routes
app.use('/api/analysis', analysisRoutes);

// Update path and variable name for RealTimeNews routes
app.use('/api/real-time-news', realTimeNewsRoutes);

// Add Diffbot routes
app.use('/api/diffbot', diffbotRoutes);

// Add Calendar routes
app.use('/api/calendar', calendarRoutes);

// Add Context routes
app.use('/api/context', contextRoutes);

// Add Schedule routes (protected cron trigger)
app.use('/api/schedule', scheduleRoutes);

// News scraping endpoint
app.get('/api/scrape/trading-economics', async (req, res) => {
  try {
    logger.info('Starting news scraping...', {
      forceFresh: req.query.fresh === 'true',
      timestamp: new Date().toISOString()
    });

    const forceFresh = req.query.fresh === 'true';
    // Dynamically import scraper to avoid cold-start import issues
    const { scrapeNews } = await import('./scraper.js');
    const articles = await scrapeNews(forceFresh);
    
    logger.info('Scraped articles:', {
      count: articles.length,
      newest: articles[0]?.created_at,
      oldest: articles[articles.length - 1]?.created_at
    });

    // Store scraped articles in Supabase
    const storageInstance = await getStorage();
    for (const article of articles) {
      try {
        await storageInstance.storeArticle(article);
        logger.info('Stored article:', {
          title: article.title,
          created_at: article.created_at,
          url: article.url
        });
      } catch (error) {
        logger.error('Failed to store article:', {
          error: error.message,
          article: {
            title: article.title,
            url: article.url
          }
        });
      }
    }
    
    res.json(articles);
  } catch (error) {
    logger.error('Scraping error:', error);
    res.status(500).json({ 
      error: 'Failed to scrape news',
      message: error.message 
    });
  }
});

// Add test endpoint for Diffbot API
app.get('/api/test-diffbot', async (req, res) => {
  const targetUrl = 'https://tradingeconomics.com/united-states/news';
  logger.info('Testing Diffbot API with URL:', { targetUrl });

  try {
    const response = await axios.get('https://api.diffbot.com/v3/analyze', {
      params: {
        url: targetUrl,
        token: process.env.VITE_DIFFBOT_TOKEN,
        fields: '*',
        discussion: true,
        timeout: 30000
      }
    });

    logger.info('Diffbot API Response:', {
      status: response.status,
      objectCount: response.data.objects?.length || 0,
      types: response.data.objects?.map(obj => obj.type),
      firstObject: response.data.objects?.[0],
      discussionCount: response.data.objects?.[0]?.discussion?.length || 0
    });

    res.json({
      status: 'success',
      data: response.data
    });
  } catch (error) {
    logger.error('Error calling Diffbot API:', {
      error: error.response?.data || error.message,
      status: error.response?.status
    });
    res.status(500).json({
      status: 'error',
      error: error.response?.data || error.message
    });
  }
});

const PORT = process.env.PORT || 3001;
if (!process.env.VERCEL) {
app.listen(PORT, () => {
  // Keep this one for confirmation the server started
  console.log(`Server running on port ${PORT}`);
});
}
export default function handler(req, res) {
  return app(req, res);
}