import cron from 'node-cron';
import { scrapeNews } from '../trading-economics/scraper.js';
import { SupabaseStorage } from '../storage/supabase/supabaseStorage.js';
import logger from '../../src/logger.js';

export default class NewsScheduler {
  constructor() {
    this.storage = new SupabaseStorage();
    this.lastRun = null;
  }

  start() {
    logger.info('News scheduler started - will run every 5 minutes between 3-4 PM EST on weekdays');
    
    // Run every 5 minutes between 3-4 PM EST on weekdays
    cron.schedule('*/5 15 * * 1-5', async () => {
      try {
        this.lastRun = new Date();
        logger.info('Scheduler executing', {
          runTime: this.lastRun.toISOString(),
          source: 'afternoon-trading-job'
        });
        
        const articles = await scrapeNews();
        await this.storage.storeArticles(articles, 'afternoon-trading-job');
        
        logger.info('Scheduler completed', {
          runTime: new Date().toISOString(),
          articlesFound: articles.length,
          source: 'afternoon-trading-job'
        });
      } catch (error) {
        logger.error('Scheduler failed:', {
          error,
          runTime: new Date().toISOString(),
          source: 'afternoon-trading-job'
        });
      }
    });

    return this;
  }

  getStatus() {
    return {
      lastRun: this.lastRun,
      isRunning: true,
      nextScheduledRun: this.lastRun ? new Date(this.lastRun.getTime() + 5 * 60 * 1000) : null
    };
  }
}
