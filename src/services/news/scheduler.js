import cron from 'node-cron';
import { scrapeNews } from '../../scraper.js';
import logger from '../../logger.js';
import { SupabaseStorage } from '../storage/supabase/supabaseStorage.js';

export class NewsScheduler {
  constructor() {
    this.isRunning = false;
    this.storage = new SupabaseStorage();
    this.lastRun = null;
    this.runCount = 0;
    this.lastArticlesCount = 0;
    this.lastError = null;
  }

  async runScraper() {
    if (this.isRunning) {
      logger.info('Scraper already running, skipping this run');
      return;
    }

    this.isRunning = true;
    this.runCount++;
    this.lastRun = new Date().toISOString();
    this.lastError = null;

    try {
      logger.info('Starting scheduled news scrape', {
        runCount: this.runCount,
        lastRun: this.lastRun
      });
      
      const articles = await scrapeNews();
      this.lastArticlesCount = articles.length;
      
      // Store articles in Supabase
      if (articles.length > 0) {
        await this.storage.storeArticles(articles);
        logger.info('Stored articles in Supabase', {
          count: articles.length,
          firstArticle: {
            title: articles[0]?.title,
            date: articles[0]?.publishedAt
          },
          runCount: this.runCount
        });
      }

      logger.info('Completed scheduled news scrape', {
        articlesFound: articles.length,
        firstArticle: articles[0]?.title,
        timestamp: this.lastRun,
        runCount: this.runCount
      });
    } catch (error) {
      this.lastError = error.message;
      logger.error('Failed to run scheduled scrape:', {
        error: error.message,
        runCount: this.runCount,
        lastRun: this.lastRun
      });
    } finally {
      this.isRunning = false;
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      runCount: this.runCount,
      lastArticlesCount: this.lastArticlesCount,
      lastError: this.lastError,
      nextRun: this.getNextRunTime()
    };
  }

  getNextRunTime() {
    if (!this.lastRun) return null;
    const lastRunDate = new Date(this.lastRun);
    const nextRun = new Date(lastRunDate.getTime() + 5 * 60 * 1000); // Add 5 minutes
    return nextRun.toISOString();
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