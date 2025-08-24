import express from 'express';
import logger from '../logger.js';

const router = express.Router();
let storage = null;

// Lazy storage initialization
async function getStorage() {
  if (!storage) {
    try {
      const { SupabaseStorage } = await import('../services/storage/supabase/supabaseStorage.js');
      storage = new SupabaseStorage();
      logger.info('News routes: SupabaseStorage initialized');
    } catch (error) {
      logger.error('News routes: Failed to initialize storage:', error);
      throw error;
    }
  }
  return storage;
}

export function initializeRoutes(storageInstance) {
  storage = storageInstance;

  // Add root endpoint
  router.get('/', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const storageInstance = await getStorage();
      const { articles } = await storageInstance.getRecentArticles(limit);
      res.json(articles);
    } catch (error) {
      logger.error('Failed to fetch recent articles:', error);
      res.status(500).json({ error: 'Failed to fetch recent articles' });
    }
  });

  router.get('/recent', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const storageInstance = await getStorage();
      const { articles } = await storageInstance.getRecentArticles(limit);
      res.json(articles);
    } catch (error) {
      logger.error('Failed to fetch recent articles:', error);
      res.status(500).json({ error: 'Failed to fetch recent articles' });
    }
  });

  router.get('/search', async (req, res) => {
    try {
      const { query } = req.query;
      if (!query) {
        return res.status(400).json({ error: 'Search query is required' });
      }
      const storageInstance = await getStorage();
      const articles = await storageInstance.searchArticles(query);
      res.json(articles);
    } catch (error) {
      logger.error('Failed to search articles:', error);
      res.status(500).json({ error: 'Failed to search articles' });
    }
  });

  // Test endpoint for adding sample articles
  router.post('/test-article', async (req, res) => {
    try {
      const storageInstance = await getStorage();

      const testArticle = {
        id: Date.now(),
        title: req.body.title || "Test Article: Market Volatility Expected",
        content: req.body.content || "Markets are experiencing increased volatility due to recent economic indicators. Analysts predict significant movement in the coming days.",
        url: req.body.url || `https://test.tradingeconomics.com/test-article-${Date.now()}`,
        published_at: req.body.published_at || new Date().toISOString(),
        source: "Test Source",
        category: req.body.category || "stock market",
        sentiment_score: req.body.sentiment_score || 0.5,
        sentiment_label: req.body.sentiment_label || "positive",
        raw_data: {
          title: req.body.title || "Test Article: Market Volatility Expected",
          content: req.body.content || "Markets are experiencing increased volatility due to recent economic indicators. Analysts predict significant movement in the coming days.",
          url: req.body.url || `https://test.tradingeconomics.com/test-article-${Date.now()}`,
          publishedAt: req.body.published_at || new Date().toISOString()
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        unique_key: `test-article-${Date.now()}`
      };

      const result = await storageInstance.supabase
        .from('articles')
        .insert([testArticle]);

      if (result.error) {
        throw result.error;
      }

      logger.info('Test article added successfully', { id: testArticle.id });
      res.json({
        success: true,
        message: 'Test article added',
        article: testArticle
      });
    } catch (error) {
      logger.error('Error adding test article:', error);
      res.status(500).json({ error: 'Failed to add test article', details: error.message });
    }
  });

  return router;
}

export default router;
