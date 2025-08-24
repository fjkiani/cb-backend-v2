// backend/src/tests/integration/supabase.test.ts
import { SupabaseStorage } from '../../../../src/services/storage/supabase/supabaseStorage';
const { scrapeNews, cleanup } = require('../../scraper');
import logger from '../../logger';
import Redis from 'ioredis';
import { DiffbotArticle } from '../../types/article.types';  // Add this import

describe('Supabase Storage Integration with Real Data', () => {
  let storage: SupabaseStorage;
  let redis: Redis;

  beforeAll(async () => {
    storage = new SupabaseStorage();
    redis = new Redis({
      host: 'localhost',
      port: 6379
    });
    await populateTestData();
  });

  async function populateTestData() {
    try {
      const articles = await scrapeNews(true);
      // Remove duplicates before storing
      const uniqueArticles = Array.from(
        new Map(articles.map(article => [article.url, article])).values()
      );
      await storage.storeArticles(uniqueArticles);
      logger.info(`Populated database with ${uniqueArticles.length} unique articles`);
    } catch (error) {
      logger.error('Failed to populate test data:', error);
    }
  }

  it('should store and retrieve real Diffbot-processed articles', async () => {
    try {
      const articles = await scrapeNews(true) as DiffbotArticle[];
      logger.info(`Received ${articles.length} articles from scraper`);
      
      if (!articles || articles.length === 0) {
        logger.warn('No articles received from scraper, skipping test');
        return;
      }

      const uniqueArticles = Array.from(
        new Map(articles.map((article: DiffbotArticle) => [article.url, article])).values()
      );
      logger.info(`Filtered down to ${uniqueArticles.length} unique articles`);

      // Log a sample article to verify structure
      logger.info('Sample article structure:', {
        sample: uniqueArticles[0] ? {
          title: uniqueArticles[0].title,
          url: uniqueArticles[0].url,
          publishedAt: uniqueArticles[0].publishedAt
        } : 'No articles found'
      });

      const stored = await storage.storeArticles(uniqueArticles);
      logger.info(`Storage response length: ${stored?.length || 0}`);

      const retrievedArticles = await storage.getRecentArticles(uniqueArticles.length);
      logger.info(`Retrieved ${retrievedArticles.length} articles from database`);

      expect(retrievedArticles.length).toBeGreaterThan(0);
      
      // Log first retrieved article
      if (retrievedArticles.length > 0) {
        logger.info('First retrieved article:', {
          title: retrievedArticles[0].title,
          url: retrievedArticles[0].url,
          published_at: retrievedArticles[0].published_at
        });
      }

    } catch (error) {
      logger.error('Test failed:', error);
      throw error;
    }
  }, 30000);

  it('should retrieve articles by category', async () => {
    try {
      const categories = await storage.getUniqueCategories();
      logger.info('Available categories:', categories);

      if (categories.length > 0) {
        const category = categories[0];
        const articles = await storage.getArticlesByCategory(category);
        expect(articles.length).toBeGreaterThan(0);
        logger.info(`Found ${articles.length} articles in category ${category}`);
      } else {
        logger.warn('No categories found in database');
        // Skip test if no categories are available
        return;
      }
    } catch (error) {
      logger.error('Category test failed:', error);
      throw error;
    }
  });

  it('should search articles', async () => {
    try {
      const sampleArticle = await storage.getSampleArticle();

      if (sampleArticle?.content) {
        const words = sampleArticle.content.split(' ');
        // Get a word that's at least 4 characters long
        const searchTerm = words.find(word => word.length >= 4) || words[0];
        
        const articles = await storage.searchArticles(searchTerm);
        expect(articles.length).toBeGreaterThan(0);
        logger.info(`Found ${articles.length} articles matching "${searchTerm}"`);
      } else {
        logger.warn('No articles found to test search');
        // Skip test if no articles are available
        return;
      }
    } catch (error) {
      logger.error('Search test failed:', error);
      throw error;
    }
  });

  // Properly close the test suite
  afterEach(async () => {
    // Cleanup after each test
    await cleanup();
  });

  afterAll(async () => {
    // Final cleanup
    await cleanup();
    
    // Close Redis connection
    await redis.quit();
    
    // Wait for any pending operations
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Clear storage reference
    storage = null as any;
  });
});