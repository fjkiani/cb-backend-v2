import express from 'express';
import { scrapeTradingEconomics } from '../../scraper/trading-economics.js';
import { supabase } from '../../db/supabase.js';
import logger from '../../utils/logger.js';

const router = express.Router();

router.get('/trading-economics', async (req, res) => {
  try {
    const forceFresh = req.query.fresh === 'true';

    // Send immediate response
    res.json({
      message: 'Trading Economics scraping initiated. Please check back in a few minutes.',
      status: 'processing',
      timestamp: new Date().toISOString()
    });

    // Continue processing in the background
    if (forceFresh) {
      scrapeTradingEconomics()
        .then(async (articles) => {
          logger.info('Background Trading Economics scraping completed:', {
            count: articles.length,
            timestamp: new Date().toISOString()
          });

          // Store the timestamp of successful scraping
          await supabase
            .from('system_status')
            .upsert([{
              key: 'last_trading_economics_scrape',
              value: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }]);
        })
        .catch(error => {
          logger.error('Background Trading Economics scraping failed:', {
            error: error.message,
            timestamp: new Date().toISOString()
          });
        });
    }
  } catch (error) {
    logger.error('Error in /trading-economics endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to initiate scraping',
      message: error.message 
    });
  }
});

export default router; 