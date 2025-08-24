// src/tests/integration/diffbot-supabase.test.ts
import { SupabaseStorage } from '../../../../../src/services/storage/supabase/supabaseStorage';
import { NewsScraper } from '../../../services/diffbot/pythonScraper';
import logger from '../../../logger';

describe('Diffbot to Supabase Integration', () => {
  let storage: SupabaseStorage;
  let scraper: NewsScraper;

  beforeAll(() => {
    storage = new SupabaseStorage();
    scraper = new NewsScraper();
  });

  test('should store Diffbot articles in Supabase', async () => {
    try {
      // Force a check for new articles
      await scraper.checkForNewNews();

      // Get the most recent articles from Supabase
      const articles = await storage.getRecentArticles(5);
      
      // Verify we have articles
      expect(articles.length).toBeGreaterThan(0);

      // Verify article structure
      const article = articles[0];
      expect(article).toHaveProperty('title');
      expect(article).toHaveProperty('content');
      expect(article).toHaveProperty('url');
      expect(article).toHaveProperty('published_at');
      expect(article).toHaveProperty('sentiment_score');
      expect(article).toHaveProperty('sentiment_label');

      logger.info('Test article:', article);
    } catch (error) {
      logger.error('Test failed:', error);
      throw error;
    }
  });
});