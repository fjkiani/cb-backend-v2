import express from 'express';
import logger from '../logger.js';
import { MarketContextService } from '../services/analysis/marketContextService.js';
import { supabase } from '../supabase/client.js';

const router = express.Router();

// --- Instantiate Service ---
// For a robust setup, dependent services (Cohere, Diffbot, NewsProviderFactory)
// should ideally be instantiated once and passed to MarketContextService, or a proper DI framework used.
// For now, MarketContextService attempts to instantiate them internally.
let marketContextService;
try {
  marketContextService = new MarketContextService();
} catch (error) {
  logger.error('[contextRoutes] Failed to instantiate MarketContextService:', error);
  marketContextService = null; 
}

// --- Manual Trigger Endpoint --- 
router.post('/generate-now', async (req, res) => {
  logger.info('POST /api/context/generate-now handler reached - Manual Trigger');

  if (!marketContextService) {
    logger.error('[contextRoutes] MarketContextService is not available for generate-now.');
    return res.status(503).json({ error: 'Context generation service unavailable' });
  }

  try {
    // Always force refresh for manual trigger
    // The actual generation happens asynchronously in the service
    marketContextService.generateAndStoreContext(true) // Pass true to force refresh
      .then(result => {
        if (result.success) {
          logger.info(`[contextRoutes] MarketContextService.generateAndStoreContext promise resolved successfully for manual trigger. New context ID: ${result.newContextId}`);
        } else {
          logger.error(`[contextRoutes] MarketContextService.generateAndStoreContext promise resolved with failure for manual trigger: ${result.error}`);
        }
      })
      .catch(serviceError => {
        // This catch is for unexpected errors thrown synchronously by generateAndStoreContext or if it's not a promise initially
        logger.error('[contextRoutes] Error calling or awaiting MarketContextService.generateAndStoreContext for manual trigger:', serviceError);
      });

    // Respond immediately that the process has been initiated
    res.status(202).json({ message: 'Market context generation initiated successfully (with overview refresh).' });

  } catch (error) {
    // This catch is for errors in the route handler itself before calling the service
    logger.error('[contextRoutes] Error in /generate-now route:', { message: error.message });
    res.status(500).json({ 
      error: 'Failed to initiate market context generation',
      message: error.message 
    });
  }
});

// --- Read Endpoint (Phase 2 Implementation) --- 
router.get('/latest', async (req, res) => {
  logger.info('GET /api/context/latest handler reached');
  
  try {
    const { data, error } = await supabase
      .from('market_context') // Ensure this matches your table name
      .select('context_text, generated_at') // Select text and timestamp
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle(); // Returns null instead of error if no rows found

    if (error) {
      logger.error('Error fetching latest market context from Supabase', error);
      throw error; // Let the catch block handle it
    }

    if (data) {
      logger.info('Successfully fetched latest market context.', { generatedAt: data.generated_at });
      res.json({ 
        contextText: data.context_text,
        generatedAt: data.generated_at 
      });
    } else {
      logger.info('No market context found in Supabase.');
      res.status(404).json({ error: 'No market context found.' });
    }

  } catch (error) {
    logger.error('Error in GET /api/context/latest:', { message: error.message });
    res.status(500).json({ 
      error: 'Failed to fetch latest market context',
      message: error.message 
    });
  }
});

export default router; 