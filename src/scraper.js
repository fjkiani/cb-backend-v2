import axios from 'axios';
import logger from './logger.js';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRedisClient, cleanup as cleanupRedis } from './services/redis/redisClient.js';
import { NewsClassificationService } from './services/newsClassificationService.js';
import { supabase } from './services/supabase/client.js';
// import { CohereService } from './services/analysis/cohere.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CACHE_DURATION = 300; // 5 minutes
const RATE_LIMIT_DELAY = 1500; // 1.5 seconds between requests
const LOOKBACK_WINDOW = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const MAX_AGE_DAYS = 30; // Don't accept articles older than this

// Add these validation functions at the top
const MINIMUM_CONTENT_LENGTH = 100;
const MEANINGFUL_TITLE_LENGTH = 15;

// Important economic indicators we want to keep
const importantIndicators = [
  'consumer confidence',
  'consumer sentiment',
  'gdp',
  'inflation',
  'unemployment',
  'interest rate',
  'retail sales',
  'housing'
];

// Initialize services lazily
let classificationService;
// let cohereService;

function initializeServices() {
  try {
    if (!classificationService) {
      classificationService = new NewsClassificationService();
      logger.info('NewsClassificationService initialized');
    }
    // if (!cohereService) {
    //   cohereService = new CohereService();
    //   logger.info('CohereService initialized');
    // }
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    throw error;
  }
}

function isValidArticle(item) {
  // Defensive checks first
  if (!item) {
    logger.debug('Invalid item: null or undefined');
    return false;
  }

  // Log the item being validated
  logger.info('Validating article:', {
    title: item.title,
    url: item.url,
    summary: item.summary?.slice(0, 100),
    content: item.content?.slice(0, 100)
  });

  // Check title quality
  if (!item.title) {
    logger.debug('Missing title');
    return false;
  }

  const title = item.title.toString();
  if (title.length < MEANINGFUL_TITLE_LENGTH || title === item.category) {
    logger.debug('Skipping article with invalid title:', { 
      title: title,
      length: title.length,
      matchesCategory: title === item.category
    });
    return false;
  }

  // Check if it's a real news article (not a data point)
  const dataPointIndicators = [
    'precipitation', 
    'commodity', 
    'co2-emissions'
  ];

  const urlLower = (item.url || '').toLowerCase();
  const titleLower = title.toLowerCase();

  // If it's an earnings article, allow it through
  if (urlLower.includes(':eps') || titleLower.includes('earnings')) {
    return true;
  }

  // If it's a stream URL, check if it's an important indicator we want to keep
  if (urlLower.includes('stream?i=')) {
    const isImportantIndicator = importantIndicators.some(indicator => 
      urlLower.includes(indicator) || titleLower.includes(indicator)
    );
    if (isImportantIndicator) {
      return true;
    }
  }

  // Check if it's an important indicator article (even if not a stream URL)
  const isImportantIndicator = importantIndicators.some(indicator => 
    urlLower.includes(indicator) || titleLower.includes(indicator)
  );
  if (isImportantIndicator) {
    return true;
  }

  // Check other data point indicators
  if (dataPointIndicators.some(indicator => 
    titleLower.includes(indicator) || 
    urlLower.includes(indicator)
  )) {
    logger.debug('Skipping data point entry:', { 
      title: title,
      url: item.url
    });
    return false;
  }

  // Allow stock market news through
  if (urlLower.includes('stock-market') || 
      titleLower.includes('stock') || 
      titleLower.includes('market')) {
    return true;
  }

  // Allow currency and bond news through
  if (urlLower.includes('currency') || 
      urlLower.includes('bond') || 
      titleLower.includes('dollar') || 
      titleLower.includes('yield')) {
    return true;
  }

  return true;
}

async function analyzeStream(url) {
  logger.info('Analyzing news stream', { url });
  
  // Increase timeout to 60 seconds
  const DIFFBOT_TIMEOUT = 60000;
  const MAX_RETRIES = 3;
  let retryCount = 0;

  while (retryCount < MAX_RETRIES) {
    try {
      const response = await axios.get('https://api.diffbot.com/v3/analyze', {
        params: {
          token: process.env.DIFFBOT_TOKEN,
          url: url,
          discussion: false,
          timeout: DIFFBOT_TIMEOUT,
          // Add fields to ensure we get what we need
          fields: 'title,text,date,sentiment,links,meta'
        }
      });

      // Validate response structure
      if (!response.data?.objects?.[0]?.items) {
        logger.warn('Invalid response structure, retrying...', {
          attempt: retryCount + 1,
          response: JSON.stringify(response.data).slice(0, 500)
        });
        retryCount++;
        
        if (retryCount === MAX_RETRIES) {
          throw new Error('Failed to get valid response after max retries');
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }

      logger.info('Diffbot analysis successful', {
        itemCount: response.data.objects[0].items.length,
        firstItemTitle: response.data.objects[0].items[0]?.title
      });

      return response.data;

    } catch (error) {
      logger.error('Diffbot API error:', {
        attempt: retryCount + 1,
        error: error.response?.data || error.message,
        status: error.response?.status
      });

      retryCount++;
      if (retryCount === MAX_RETRIES) {
        throw new Error(`Diffbot API failed after ${MAX_RETRIES} attempts: ${error.message}`);
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

async function tryCache(redis, forceFresh = false) {
  if (!forceFresh && redis) {
    try {
      const cachedData = await redis.get('trading-economics-news');
      if (cachedData) {
        const parsed = JSON.parse(cachedData);
        logger.info('Returning cached data', { 
          articleCount: parsed.length,
          sample: parsed[0]?.title,
          newest: parsed[0]?.publishedAt,
          oldest: parsed[parsed.length - 1]?.publishedAt
        });
        return parsed;
      }
    } catch (error) {
      logger.warn('Cache retrieval failed, continuing with fresh data:', error.message);
    }
  }
  return null;
}

async function trySetCache(redis, processedNews) {
  if (redis && processedNews.length > 0) {
    try {
      await redis.set('trading-economics-news', JSON.stringify(processedNews), 'EX', CACHE_DURATION);
      logger.info('Cached processed news', { 
        count: processedNews.length,
        cacheDuration: CACHE_DURATION,
        newest: processedNews[0]?.publishedAt,
        oldest: processedNews[processedNews.length - 1]?.publishedAt
      });
    } catch (error) {
      logger.warn('Cache storage failed:', error.message);
    }
  }
}

async function getLastProcessedTimestamp(redis) {
  if (!redis) return null;
  try {
    const timestamp = await redis.get('last-processed-timestamp');
    return timestamp ? parseInt(timestamp) : null;
  } catch (error) {
    logger.warn('Failed to get last processed timestamp:', error.message);
    return null;
  }
}

async function setLastProcessedTimestamp(redis, timestamp) {
  if (!redis) return;
  try {
    await redis.set('last-processed-timestamp', timestamp.toString());
    logger.info('Updated last processed timestamp:', { timestamp });
  } catch (error) {
    logger.warn('Failed to set last processed timestamp:', error.message);
  }
}

async function getProcessedUrls(redis) {
  if (!redis) return new Set();
  try {
    const urls = await redis.get('processed-urls');
    return new Set(urls ? JSON.parse(urls) : []);
  } catch (error) {
    logger.warn('Failed to get processed URLs:', error.message);
    return new Set();
  }
}

async function updateProcessedUrls(redis, newKeys) {
  if (!redis) return;
  try {
    const existingKeys = await getProcessedUrls(redis);
    const combinedKeys = [...existingKeys, ...newKeys];
    // Keep only last 1000 composite keys to prevent memory issues
    const recentKeys = combinedKeys.slice(-1000);
    await redis.set('processed-urls', JSON.stringify(recentKeys));
    logger.info('Updated processed URLs cache', { 
      newCount: newKeys.length,
      totalCount: recentKeys.length 
    });
  } catch (error) {
    logger.warn('Failed to update processed URLs:', error.message);
  }
}

async function clearCache(redis) {
  if (!redis) return;
  try {
    await redis.del('trading-economics-news');
    await redis.del('processed-urls');
    await redis.del('last-processed-timestamp');
    logger.info('Cleared all caches');
  } catch (error) {
    logger.error('Failed to clear cache:', error);
  }
}

async function getExistingArticles() {
  try {
    // Only get articles from the last hour to avoid over-aggressive duplicate detection
    const oneHourAgo = new Date(Date.now() - (60 * 60 * 1000)).toISOString();
    
    const { data: existingArticles, error } = await supabase
      .from('articles')
      .select('title, url')
      .gte('created_at', oneHourAgo);
    
    if (error) {
      logger.error('Failed to fetch existing articles:', error);
      return new Set();
    }

    // Create composite keys from existing articles
    const compositeKeys = new Set(
      existingArticles.map(article => `${article.url}|${article.title}`)
    );

    logger.info('Fetched recent articles from Supabase for duplicate check:', {
      timeframe: 'last hour',
      count: compositeKeys.size,
      firstKey: Array.from(compositeKeys)[0]
    });

    return compositeKeys;
  } catch (error) {
    logger.error('Error fetching existing articles:', error);
    return new Set();
  }
}

async function clearSupabaseArticles() {
  try {
    const { error } = await supabase
      .from('articles')
      .delete()
      .gte('created_at', new Date(Date.now() - LOOKBACK_WINDOW).toISOString());
    
    if (error) {
      logger.error('Failed to clear Supabase articles:', error);
    } else {
      logger.info('Cleared Supabase articles');
    }
  } catch (error) {
    logger.error('Error clearing Supabase articles:', error);
  }
}

export async function scrapeNews(forceFresh = false) {
  let redis;
  try {
    // Initialize services first
    initializeServices();
    
    redis = getRedisClient();
    
    // Clear cache if forceFresh
    if (forceFresh) {
      await clearCache(redis);
      await clearSupabaseArticles();
      logger.info('Forced fresh data, cleared caches and Supabase');
    }

    logger.info('Starting scrape operation...', { forceFresh });
    
    // Try cache first
    const cachedNews = await tryCache(redis, forceFresh);
    if (cachedNews) return cachedNews;

    // Get last processed timestamp and URLs
    const lastProcessed = await getLastProcessedTimestamp(redis);
    const processedUrls = await getProcessedUrls(redis);
    
    logger.info('Previous scrape info:', { 
      lastProcessed,
      processedUrlsCount: processedUrls.size
    });

    // Get existing articles from Supabase
    const existingArticles = await getExistingArticles();
    logger.info('Fetched existing articles from Supabase:', {
      count: existingArticles.size
    });

    // Get the news stream
    const streamUrl = 'https://tradingeconomics.com/stream?c=united+states';
    const analyzed = await analyzeStream(streamUrl);
    
    if (!analyzed?.objects?.[0]?.items) {
      throw new Error('Failed to analyze news stream');
    }

    // Extract articles from the analyzed data
    const articles = [];
    const seenCompositeKeys = new Set();
    const newCompositeKeys = new Set();

    // Process each article from the analyzed data
    const items = analyzed.objects[0].items;

    logger.info('Starting article processing:', {
      totalItems: items.length,
      firstTitle: items[0]?.title,
      existingArticlesCount: existingArticles.size,
      processedUrlsCount: processedUrls.size
    });

    // First pass: find the most recent valid date
    let mostRecentValidDate = new Date(); // Default to current time
    
    // Reset processed URLs if forcing fresh data
    if (forceFresh) {
      processedUrls.clear();
      logger.info('Cleared processed URLs due to force fresh');
    }

    for (const item of items) {
      const url = item.link || item['te-stream-category'] || `https://tradingeconomics.com/united-states/news#${item.title}`;
      
      // Create composite key using both URL and title
      const compositeKey = `${url}|${item.title}`;
      
      // Log the current article being processed
      logger.info('Processing article:', {
        title: item.title,
        url: url,
        isDuplicateInBatch: seenCompositeKeys.has(compositeKey),
        isPreviouslyProcessed: processedUrls.has(compositeKey),
        existsInSupabase: existingArticles.has(compositeKey)
      });

      // Check against current batch, previously processed URLs, and Supabase
      if (seenCompositeKeys.has(compositeKey) || 
          processedUrls.has(compositeKey) || 
          existingArticles.has(compositeKey)) {
        logger.debug('Skipping duplicate article:', { 
          url, 
          title: item.title,
          compositeKey,
          reason: seenCompositeKeys.has(compositeKey) 
            ? 'duplicate in batch' 
            : processedUrls.has(compositeKey)
            ? 'previously processed'
            : 'exists in Supabase'
        });
        continue;
      }

      seenCompositeKeys.add(compositeKey);
      newCompositeKeys.add(compositeKey);
      
      try {
        // Validate article before processing
        logger.info('Validating article:', {
          title: item.title,
          hasTitle: !!item.title,
          titleLength: item.title?.length,
          summaryLength: (item.summary || item.content || '').length
        });

        if (!isValidArticle(item)) {
          logger.info('Article failed validation:', {
            title: item.title,
            url: url
          });
          continue;
        }

        // Rate limiting delay
        if (articles.length > 0) {
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        }

        // Get category from the stream data
        const category = item['te-stream-category']?.split('?i=')?.[1]?.replace(/\+/g, ' ') || 'Market News';
        
        // Create base article
        const article = {
          id: `te-${Date.now()}-${articles.length}`,
          title: item.title,
          content: item.summary || 'No content available',
          url: url,
          publishedAt: mostRecentValidDate.toISOString(),
          source: 'Trading Economics',
          category: category,
          sentiment: {
            score: 0,
            label: 'neutral',
            confidence: 0
          },
          summary: item.summary || item.content || 'No summary available',
          author: 'Trading Economics',
          tags: [category]
        };

      // To:
        // Make sure services are available
        if (!classificationService) {
          throw new Error('Classification service not properly initialized');
        }

        // Only classify if it's a valid article
        const classification = await classificationService.classifyArticle(article);
        
        // Check if it's an important indicator article
        const isImportantIndicator = importantIndicators.some(indicator => 
          article.title.toLowerCase().includes(indicator) || 
          article.url.toLowerCase().includes(indicator)
        );

        // Additional validation after classification
        if (!isImportantIndicator && classification.importance <= 1 && !item.summary?.includes('market')) {
          logger.debug('Skipping low importance non-market article:', {
            title: item.title,
            importance: classification.importance
          });
          continue;
        }

        // Store all articles with importance flag
        articles.push({
          ...article,
          classification,
          importance: classification.importance,
          needsAttention: classification.importance > 3
        });

        logger.info('Processed article:', {
          title: article.title,
          url: url,
          publishedAt: mostRecentValidDate.toISOString(),
          category: category,
          importance: classification.importance
        });

      } catch (error) {
        logger.error('Error processing article:', {
          url,
          error: error.message
        });
      }
    }

    // Sort articles by date
    articles.sort((a, b) => {
      const dateA = new Date(a.publishedAt);
      const dateB = new Date(b.publishedAt);
      
      // Log sorting for debugging
      logger.debug('Sorting articles:', {
        a: {
          title: a.title,
          date: a.publishedAt,
          parsed: dateA.toISOString()
        },
        b: {
          title: b.title,
          date: b.publishedAt,
          parsed: dateB.toISOString()
        }
      });
      
      return dateB.getTime() - dateA.getTime();
    });

    if (articles.length > 0) {
      logger.info('Sorted articles:', {
        count: articles.length,
        newest: {
          title: articles[0].title,
          date: articles[0].publishedAt
        },
        oldest: {
          title: articles[articles.length - 1].title,
          date: articles[articles.length - 1].publishedAt
        }
      });
      
      // Update last processed timestamp to newest article's date
      const newestTimestamp = new Date(articles[0].publishedAt).getTime();
      await setLastProcessedTimestamp(redis, newestTimestamp);
      
      // Update processed URLs cache
      await updateProcessedUrls(redis, Array.from(newCompositeKeys));
      
      // Try to cache the results
      await trySetCache(redis, articles);
    }

    logger.info('Scrape operation completed', {
      totalArticles: items.length,
      newArticles: articles.length,
      skippedUrls: items.length - articles.length,
      mostRecentValidDate: mostRecentValidDate?.toISOString()
    });

    return articles;

  } catch (error) {
    logger.error('Scraping failed:', {
      message: error.message,
      code: error.code,
      response: error.response?.data,
      stack: error.stack
    });
    throw error;
  }
}

function getSentimentLabel(score) {
  if (score >= 0.1) return 'positive';
  if (score <= -0.1) return 'negative';
  return 'neutral';
}

export const forceRefresh = () => scrapeNews(true);
export const cleanup = cleanupRedis;

