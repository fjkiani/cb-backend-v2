import cron from 'node-cron';
import { scrapeNews } from '../../scraper.js';
import logger from '../../logger.js';
import { SupabaseStorage } from '../storage/supabase/supabaseStorage.js';

export class NewsScheduler {
  constructor() {
    this.isRunning = false;
    this.storage = new SupabaseStorage();
  }

  async runScraper() {
    if (this.isRunning) {
      logger.info('Scraper already running, skipping this run');
      return;
    }

    this.isRunning = true;
    try {
      logger.info('Starting scheduled news scrape');
      const articles = await scrapeNews();
      
      // Store articles in Supabase
      if (articles.length > 0) {
        await this.storage.storeArticles(articles);
        logger.info('Stored articles in Supabase', {
          count: articles.length,
          firstArticle: {
            title: articles[0]?.title,
            date: articles[0]?.publishedAt
          }
        });
      }

      logger.info('Completed scheduled news scrape', {
        articlesFound: articles.length,
        firstArticle: articles[0]?.title,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to run scheduled scrape:', error);
    } finally {
      this.isRunning = false;
    }
  }

  start() {
    logger.info('Starting news scheduler');

    // Run immediately on start
    this.runScraper();

    // Then schedule to run every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      logger.info('Running scheduled news check');
      await this.runScraper();
    });

    logger.info('News scheduler started successfully');
  }
} 