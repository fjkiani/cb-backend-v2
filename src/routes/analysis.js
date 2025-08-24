import express from 'express';
import { HfInference } from '@huggingface/inference';
import logger from '../logger.js';
import marketIndicators from '../config/marketIndicators.js';
import Redis from 'ioredis';
import { CohereService } from '../services/analysis/cohere.js';
import { DiffbotService } from '../services/diffbot/DiffbotService.js';
import { GoogleGenaiService } from '../services/analysis/googleGenaiService.js';

const router = express.Router();

// Redis completely disabled to prevent connection issues
// Export a mock Redis object that does nothing
export const redis = {
  get: async () => null,
  set: async () => null,
  del: async () => null,
  ping: async () => 'PONG'
};

logger.warn('Redis caching completely disabled - using mock Redis object');

const CACHE_DURATION = 3600; // 1 hour in seconds

// Helper function to create consistent cache keys
function createCacheKey(content) {
  // Create a more reliable cache key using content hash or first N chars
  return `analysis:${Buffer.from(content.slice(0, 100)).toString('base64')}`;
}

// Wrapper for Redis get with error handling - DISABLED COMPLETELY
async function getCachedAnalysis(key) {
  logger.debug('Redis caching disabled - returning null');
  return null;
}

// Wrapper for Redis set with error handling - DISABLED COMPLETELY
async function setCachedAnalysis(key, value) {
  logger.debug('Redis caching disabled - skipping cache set');
  return;
}

async function getAnalysis(content) {
  const cacheKey = createCacheKey(content);
  
  // Try to get from cache first
  const cached = await getCachedAnalysis(cacheKey);
  if (cached) {
    return cached;
  }

  logger.info('Analysis cache MISS - performing new analysis');
  
  // Perform new analysis
  const result = analyzeContent(content, marketIndicators);
  
  // Cache the result
  await setCachedAnalysis(cacheKey, result);

  return result;
}

function analyzeContent(content, indicators) {
  const lowerContent = content.toLowerCase();
  const analysis = {
    sentiment: 'neutral',
    sectors: [],
    topics: [],
    details: []
  };

  // Check sentiment
  const hasBearish = indicators.bearish.some(word => lowerContent.includes(word));
  const hasBullish = indicators.bullish.some(word => lowerContent.includes(word));
  
  if (hasBearish && !hasBullish) {
    analysis.sentiment = 'bearish';
  } else if (hasBullish && !hasBearish) {
    analysis.sentiment = 'bullish';
  }

  // Check sectors
  for (const [sector, keywords] of Object.entries(indicators.sectors)) {
    if (keywords.some(word => lowerContent.includes(word))) {
      analysis.sectors.push(sector);
    }
  }

  // Check topics
  for (const [topic, keywords] of Object.entries(indicators.topics)) {
    if (keywords.some(word => lowerContent.includes(word))) {
      analysis.topics.push(topic);
    }
  }

  // Generate readable analysis
  if (analysis.sentiment !== 'neutral') {
    analysis.details.push(`Market showing ${analysis.sentiment} signals.`);
  }

  if (analysis.sectors.length > 0) {
    analysis.details.push(`Affected sectors: ${analysis.sectors.join(', ')}.`);
  }

  if (analysis.topics.length > 0) {
    analysis.details.push(`Key factors: ${analysis.topics.join(', ')}.`);
  }

  return {
    analysis: analysis.details.join(' ') || 'No clear market signals detected.',
    sentiment: analysis.sentiment,
    sectors: analysis.sectors,
    topics: analysis.topics,
    confidence: 0.6,
    source: 'rule-based'
  };
}

router.post('/market-impact', async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content) {
      return res.status(400).json({
        error: 'No content provided for analysis'
      });
    }

    const result = await getAnalysis(content);
    res.json(result);

  } catch (error) {
    logger.error('Analysis error:', error);
    res.status(500).json({
      error: 'Analysis failed',
      message: error.message
    });
  }
});

// Update batch analysis to use the same caching mechanism
router.post('/batch-market-impact', async (req, res) => {
  try {
    const { articles } = req.body;
    
    if (!Array.isArray(articles)) {
      return res.status(400).json({ error: 'Expected array of articles' });
    }

    const results = await Promise.all(
      articles.map(async article => {
        const analysis = await getAnalysis(article.content);
        return {
          articleId: article.id,
          ...analysis
        };
      })
    );

    res.json(results);

  } catch (error) {
    logger.error('Batch analysis error:', error);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// Add a cache clear endpoint for development/testing
router.post('/clear-cache', async (req, res) => {
  try {
    const keys = await redis.keys('analysis:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    res.json({ message: `Cleared ${keys.length} cached analyses` });
  } catch (error) {
    logger.error('Cache clear error:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Instantiate CohereService (consider dependency injection later if needed)
let cohereService;
try {
  cohereService = new CohereService();
} catch (error) {
  logger.error('Failed to instantiate CohereService:', error);
  // Handle case where CohereService might fail (e.g., missing API key)
  cohereService = null; 
}

let diffbotService;
try {
  const diffbotToken = process.env.DIFFBOT_TOKEN;
  if (!diffbotToken) {
    throw new Error('DIFFBOT_TOKEN environment variable not set.');
  }
  diffbotService = new DiffbotService({ apiToken: diffbotToken }, logger);
  logger.info('DiffbotService instantiated successfully.');
} catch (error) {
  logger.error('Failed to instantiate DiffbotService:', error);
  diffbotService = null;
}

// Instantiate Google Gemini Service
// Export the service instance for potential reuse
export let googleGenaiService; 
try {
  googleGenaiService = new GoogleGenaiService(); // Assumes GEMINI_API_KEY is set
} catch (error) {
  logger.error('Failed to instantiate GoogleGenaiService:', error);
  googleGenaiService = null;
}

// --- New Market Overview Endpoint ---

router.post('/market-overview', async (req, res) => {
  logger.info('POST /api/analysis/market-overview called');
  try {
    const { articles } = req.body; // Expecting an array of InternalArticle objects

    if (!Array.isArray(articles) || articles.length === 0) {
      logger.warn('Market overview requested with invalid or empty articles array');
      return res.status(400).json({ error: 'Expected a non-empty array of articles' });
    }

    if (!cohereService) {
      logger.error('Cohere service is not available for market overview analysis.');
      return res.status(503).json({ error: 'Analysis service unavailable' });
    }

    // === Step 1: Title Triage (LLM Call) ===
    logger.info(`Starting title triage for ${articles.length} articles.`);
    const triageResult = await cohereService.triageArticleTitles(articles);
    const keyArticleUrls = triageResult.keyArticleUrls;
    const initialThemes = triageResult.initialThemes;
    logger.info('Title triage completed.', { keyUrlCount: keyArticleUrls.length });
    // === End Step 1 ===

    // === Step 2: Selective Content Fetching (Scraping) ===
    if (!diffbotService) {
        logger.error('Diffbot service is not available for content fetching.');
        // Decide whether to proceed without content or return an error
        return res.status(503).json({ error: 'Content fetching service unavailable' });
    }
    
    const fetchedContents = {}; // Use a map for URL -> content
    logger.info(`Attempting to fetch content for ${keyArticleUrls.length} key articles.`);
    
    const fetchPromises = keyArticleUrls.map(async (url) => {
      try {
        logger.debug(`Fetching content for URL: ${url}`);
        const diffbotResult = await diffbotService.analyze(url);
        // Extract text content - adjust path if needed based on DiffbotResponse type
        const content = diffbotResult?.objects?.[0]?.text;
        if (content) {
          fetchedContents[url] = content;
          logger.debug(`Successfully fetched content for URL: ${url}`, { contentLength: content.length });
        } else {
          logger.warn(`No text content found by Diffbot for URL: ${url}`, { response: diffbotResult });
          fetchedContents[url] = null; // Mark as attempted but failed
        }
      } catch (error) {
        logger.error(`Failed to fetch content for URL: ${url}`, { message: error.message });
        fetchedContents[url] = null; // Mark as failed
      }
    });

    await Promise.all(fetchPromises);
    logger.info('Content fetching phase completed.', { 
        successfulFetches: Object.values(fetchedContents).filter(c => c !== null).length,
        failedFetches: Object.values(fetchedContents).filter(c => c === null).length
    });
    // === End Step 2 ===

    // === Step 3: Selective Summarization (LLM Call) ===
    const detailedSummaries = {}; // Use a map for URL -> summary
    logger.info('Starting summarization for successfully fetched articles.');

    // Create a list of tasks for summarization
    const summarizationPromises = Object.entries(fetchedContents)
      .filter(([url, content]) => content !== null) // Only summarize if content exists
      .map(async ([url, content]) => {
        try {
          // Find the original article to get the title (optional, but good for the prompt)
          const originalArticle = articles.find(a => a.url === url);
          const title = originalArticle ? originalArticle.title : 'Article Summary'; // Use original title or placeholder
          
          logger.debug(`Summarizing content for URL: ${url}`, { title });
          // Call analyzeArticle, providing content, using title, and null for classification
          const analysisResult = await cohereService.analyzeArticle({ 
              title: title,
              content: content, 
              classification: null // Classification not needed for this step
          });
          
          // Extract the summary
          if (analysisResult && analysisResult.summary) {
            detailedSummaries[url] = analysisResult.summary;
            logger.debug(`Successfully summarized content for URL: ${url}`);
          } else {
            logger.warn(`Cohere analysis did not return a summary for URL: ${url}`, { analysisResult });
            detailedSummaries[url] = 'Summary unavailable.'; // Mark as summary failed
          }
        } catch (error) {
           logger.error(`Failed to summarize content for URL: ${url}`, { message: error.message });
           detailedSummaries[url] = 'Error during summarization.'; // Mark as failed
        }
      });
      
    await Promise.all(summarizationPromises);
    logger.info('Summarization phase completed.', { 
        summariesGenerated: Object.keys(detailedSummaries).length,
        articlesAttempted: Object.values(fetchedContents).filter(c => c !== null).length
    });
    // === End Step 3 ===

    // === Step 4: Synthesize Market Overview (LLM Call) ===
    logger.info('Synthesizing final market overview.');
    const finalOverview = await cohereService.synthesizeOverview(initialThemes, detailedSummaries);
    logger.info('Final overview synthesis completed.');
    // === End Step 4 ===

    // === Step 5: Return Combined Results ===
    // Include detailedSummaries in debug for now
    if (finalOverview && typeof finalOverview === 'string' && finalOverview.trim() !== '' && !finalOverview.startsWith('Error')) {
      try {
        const redisKey = 'overview:realtime-news'; // Defined in MarketContextService
        const ttl = 3600; // 1 hour
        await redis.set(redisKey, finalOverview, 'EX', ttl);
        logger.info('Successfully cached RealTimeNews overview', { key: redisKey });
      } catch (cacheError) {
        logger.error('Failed to cache RealTimeNews overview', { error: cacheError.message });
        // Do not fail the request if caching fails
      }
    }
    
    res.json({
      overview: finalOverview, // Use the generated overview
      processedArticles: articles, // Placeholder - potentially return updated articles with summaries/content later
      debug: {
          initialThemes,
          keyArticleUrls,
          fetchedContentUrls: Object.keys(fetchedContents).filter(url => fetchedContents[url] !== null),
          failedContentUrls: Object.keys(fetchedContents).filter(url => fetchedContents[url] === null),
          summariesGeneratedUrls: Object.keys(detailedSummaries).filter(url => !detailedSummaries[url].startsWith('Summary unavailable') && !detailedSummaries[url].startsWith('Error')),
          summariesFailedUrls: Object.keys(detailedSummaries).filter(url => detailedSummaries[url].startsWith('Summary unavailable') || detailedSummaries[url].startsWith('Error'))
      }
    });
    // === End Step 5 ===

  } catch (error) {
    // Log concise error info
    logger.error('Error in /market-overview endpoint:', { 
        message: error.message, 
        status: error.response?.status, // Log status if available
        stack: error.stack // Log stack trace for debugging
    });
    res.status(500).json({
      error: 'Failed to generate market overview',
      message: error.message
    });
  }
});

// --- New Trading Economics Overview Endpoint ---

router.post('/trading-economics-overview', async (req, res) => {
  logger.info('POST /api/analysis/trading-economics-overview called');
  try {
    const { articles } = req.body; // Expecting array of articles with summaries in 'content'

    if (!Array.isArray(articles) || articles.length === 0) {
      logger.warn('TE overview requested with invalid or empty articles array');
      return res.status(400).json({ error: 'Expected a non-empty array of articles' });
    }

    // Check if required services are available
    if (!cohereService) {
      logger.error('Cohere service is not available for TE title triage.');
      return res.status(503).json({ error: 'Analysis service unavailable' });
    }
    if (!googleGenaiService) {
      logger.error('Google Genai service is not available for TE overview synthesis.');
      return res.status(503).json({ error: 'Analysis service unavailable' });
    }

    // === Step 1: Title Triage (LLM Call - using Cohere) ===
    logger.info(`Starting TE title triage for ${articles.length} articles.`);
    const articlesForTriage = articles.slice(0, 40); 
    logger.info(`Sending ${articlesForTriage.length} most recent articles for triage.`);
    logger.debug('Sample articles passed to TE triage:', { sample: articlesForTriage.slice(0, 3).map(a => ({ title: a.title, url: a.url, hasContent: !!a.content })) });
    const triageResult = await cohereService.triageArticleTitles(articlesForTriage);
    const initialThemes = triageResult.initialThemes;
    logger.info('TE title triage completed.', { keyUrlCount: triageResult.keyArticleUrls?.length ?? 0 }); 
    // === End Step 1 ===

    // === Step 2 (Modified): Gather Existing Summaries ===
    const summariesToSynthesize = {};
    const potentialSummaries = articlesForTriage
        .filter(a => a.content && a.content !== 'No content available' && a.content.length > 50) 
        .slice(0, 25);
    logger.info(`Gathering summaries from ${potentialSummaries.length} articles for synthesis.`);
    potentialSummaries.forEach(article => {
        summariesToSynthesize[article.url] = article.content; 
    });
    logger.info('Existing summary gathering completed.', { 
        summariesCollected: Object.keys(summariesToSynthesize).length,
    });
    // === End Step 2 ===

    // === Step 3 (Skipped): Summarization ===
    // No need to call LLM again, we use existing summaries

    // === Step 4: Synthesize Market Overview (LLM Call - using Gemini) ===
    logger.info('Synthesizing final TE market overview with collected summaries using Gemini.');
    logger.debug('Data passed to Gemini synthesis:', {
        themesProvided: !!initialThemes,
        themeSnippet: initialThemes?.substring(0,100) + '...',
        summariesCount: Object.keys(summariesToSynthesize).length,
        // Log a sample summary if available
        sampleSummary: Object.values(summariesToSynthesize)[0]?.substring(0, 100) + '...' || 'N/A'
    });
    // Call the Google service for synthesis
    const finalOverview = await googleGenaiService.synthesizeOverview(initialThemes, summariesToSynthesize);
    logger.info('Final TE overview synthesis completed using Gemini.');
    // === End Step 4 ===

    // === Step 5: Return Combined Results ===
    if (finalOverview && typeof finalOverview === 'string' && finalOverview.trim() !== '' && !finalOverview.startsWith('Error')) {
      try {
        const redisKey = 'overview:trading-economics'; // Defined in MarketContextService
        const ttl = 3600; // 1 hour
        await redis.set(redisKey, finalOverview, 'EX', ttl);
        logger.info('Successfully cached Trading Economics overview', { key: redisKey });
      } catch (cacheError) {
        logger.error('Failed to cache Trading Economics overview', { error: cacheError.message });
        // Do not fail the request if caching fails
      }
    }
    
    res.json({
      overview: finalOverview, 
      debug: {
          initialThemes,
          keyArticleUrls: triageResult.keyArticleUrls, // Still return for debug if needed
          summariesCollectedCount: Object.keys(summariesToSynthesize).length,
          summariesCollectedUrls: Object.keys(summariesToSynthesize) 
      }
    });
    // === End Step 5 ===

  } catch (error) {
    // Log concise error info
    logger.error('Error in /trading-economics-overview endpoint:', { 
        message: error.message, 
        status: error.response?.status, // Log status if available
        stack: error.stack // Log stack trace for debugging
    });
    res.status(500).json({
      error: 'Failed to generate Trading Economics market overview',
      message: error.message
    });
  }
});

export default router;