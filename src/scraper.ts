import axios from 'axios';
import logger from './logger';
import { CacheService } from './services/cache/CacheService';
import { DIFFBOT_FIELDS } from './config/diffbot';
import dotenv from 'dotenv';

dotenv.config();

// Initialize cache service
const cacheService = new CacheService({
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379'
}, logger);

// Cache settings
const CACHE_DURATION = parseInt(process.env.CACHE_DURATION || '900', 10); // Convert to seconds for Redis

interface Article {
  title: string;
  content: string;
  url: string;
  publishedAt: string;
  source: string;
  category: string;
  type: string;
  sentiment: {
    score: number;
    label: string;
    confidence: number;
  };
  summary: string;
  author: string;
  id: string;
  naturalLanguage: {
    summary: string;
    topics: string[];
  };
  tags: any[];
}

interface DiffbotPost {
  type?: string;
  title?: string;
  text?: string;
  html?: string;
  content?: string;
  summary?: string;
  description?: string;
  pageUrl?: string;
  url?: string;
  date?: string;
  estimatedDate?: string;
  created?: string;
  author?: string;
  username?: string;
  creator?: string;
  sentiment?: number;
  category?: string;
  tags?: Array<{ label: string }>;
  discussion?: {
    posts?: DiffbotPost[];
  };
}

export async function scrapeNews(forceFresh = false) {
  const logger = getLogger();
  logger.info('Starting scrape operation...', { forceFresh });

  try {
    if (forceFresh) {
      await clearCache();
      logger.info('Cleared Redis cache');
    }

    const targetUrl = 'https://tradingeconomics.com/united-states/news';
    const response = await axios.get('https://api.diffbot.com/v3/analyze', {
      params: {
        url: targetUrl,
        token: process.env.DIFFBOT_TOKEN,
        naturalLanguage: 'summary'
      }
    });

    logger.info('Raw Diffbot response structure:', {
      hasObjects: !!response.data.objects,
      objectCount: response.data.objects?.length,
      types: response.data.objects?.map(obj => obj.type),
      firstObject: response.data.objects?.[0] ? {
        type: response.data.objects[0].type,
        hasText: !!response.data.objects[0].text,
        hasTitle: !!response.data.objects[0].title,
        hasDate: !!response.data.objects[0].date
      } : null
    });

    const articles = [];
    
    // Process all objects from the analyze API
    if (response.data.objects) {
      for (const obj of response.data.objects) {
        // Skip non-article and non-post objects
        if (!['article', 'post'].includes(obj.type)) {
          continue;
        }

        // Skip if no content or date
        if (!obj.text || !obj.date) {
          logger.debug('Skipping object without required fields', {
            type: obj.type,
            hasText: !!obj.text,
            hasDate: !!obj.date,
            title: obj.title
          });
          continue;
        }

        articles.push({
          title: obj.title || `${obj.author || 'Trading Economics'} Update`,
          content: obj.text,
          url: obj.pageUrl || obj.url || targetUrl,
          published_at: new Date(obj.date || obj.estimatedDate).toISOString(),
          source: getSourceFromAuthor(obj.author),
          category: 'Market News',
          sentiment_score: obj.sentiment || 0,
          summary: obj.naturalLanguage?.summary || ''
        });

        // If this object has discussion posts, add them too
        if (obj.discussion?.posts) {
          for (const post of obj.discussion.posts) {
            if (post.text && post.date) {
              articles.push({
                title: post.title || `${post.author || 'Trading Economics'} Update`,
                content: post.text,
                url: post.pageUrl || post.authorUrl || targetUrl,
                published_at: new Date(post.date).toISOString(),
                source: getSourceFromAuthor(post.author),
                category: 'Market News',
                sentiment_score: post.sentiment || 0,
                summary: post.naturalLanguage?.summary || ''
              });
            }
          }
        }
      }
    }

    logger.info('Processed articles:', {
      total: articles.length,
      sources: [...new Set(articles.map(a => a.source))],
      dateRange: {
        newest: articles[0]?.published_at,
        oldest: articles[articles.length - 1]?.published_at
      }
    });

    return articles;
  } catch (error) {
    logger.error('Scrape operation failed:', error);
    throw error;
  }
}

function getSourceFromAuthor(author: string | null | undefined): string {
  // Handle null/undefined/empty cases
  if (!author || typeof author !== 'string') {
    logger.debug('No author provided or invalid type', { author });
    return 'Trading Economics';
  }
  
  // Known Trading Economics author variations
  const tradingEconomicsAuthors = ['stocks', 'Stock Market', 'Markets', 'Trading Economics'];
  if (tradingEconomicsAuthors.includes(author)) {
    logger.debug('Matched Trading Economics author variation', { author });
    return 'Trading Economics';
  }
  
  // If it's a URL, extract domain
  if (author.toLowerCase().startsWith('http')) {
    try {
      const url = new URL(author);
      // Handle cases where hostname might be empty or malformed
      if (!url.hostname) {
        logger.warn('URL parsing resulted in empty hostname', { author });
        return 'Trading Economics';
      }
      
      const cleanHostname = url.hostname.replace(/^www\./, '');
      if (!cleanHostname) {
        logger.warn('Hostname cleaning resulted in empty string', { author, originalHostname: url.hostname });
        return 'Trading Economics';
      }
      
      logger.debug('Successfully extracted hostname from URL', { 
        author,
        originalHostname: url.hostname,
        cleanHostname 
      });
      return cleanHostname;
      
    } catch (e) {
      logger.warn('Failed to parse author URL', { 
        author,
        error: (e as Error).message,
        errorType: (e as Error).name
      });
      return 'Trading Economics';
    }
  }
  
  // Return original author if it's not a URL
  logger.debug('Using original author value', { author });
  return author;
}

// Helper function
function getSentimentLabel(score: number): string {
  if (score >= 0.5) return 'positive';
  if (score <= -0.5) return 'negative';
  return 'neutral';
}

export { scrapeNews }; 