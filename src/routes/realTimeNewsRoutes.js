import express from 'express';
import logger from '../logger.js';
import { getNewsAdapter } from '../services/news/NewsProviderFactory.js';

// Log to confirm module is loaded
logger.info('realTimeNewsRoutes.js module loaded');

const router = express.Router();

// This route can now potentially handle different sources if needed
// Maybe change path to /api/news/search ? Or keep specific for now?
// Keeping specific for now for simplicity, but using the factory
router.get('/news', async (req, res) => {
  const sourceName = 'RealTimeNews'; // Or potentially get from query param: req.query.source || 'RealTimeNews';
  logger.info(`GET /api/real-time-news/news handler reached for source: ${sourceName}`, { 
    query: req.query,
    timestamp: new Date().toISOString()
  });

  try {
    const adapter = getNewsAdapter(sourceName);
    
    // Extract search params from request query - adjust as needed
    const searchParams = {
        query: req.query.query || 'Market News', // Get query from request or default
        limit: req.query.limit ? parseInt(req.query.limit, 10) : 20, // Get limit or default
        // Add other params if needed
    };
    
    // We don't need forceRefresh logic here anymore, adapter handles its own logic
    // Caching should ideally happen at a higher level or within the adapter if needed
    const articles = await adapter.searchNews(searchParams); 
    
    // Articles are now in InternalArticle format
    res.json({ 
      articles, 
      message: `Fetched ${sourceName} data`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error in ${sourceName} news route:`, { message: error.message, stack: error.stack });
    res.status(500).json({ 
      error: `Failed to fetch news from ${sourceName}`,
      message: error.message 
    });
  }
});

export default router; 