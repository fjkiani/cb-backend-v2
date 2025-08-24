// src/services/news/pythonScraper.ts
import { PythonShell } from 'python-shell';
import path from 'path';
import { spawn } from 'child_process';
import logger from '../../logger.js';
import { SupabaseStorage } from '../storage/supabase/supabaseStorage';

interface DiffbotArticle {
  date: string;
  sentiment: number;
  author: string;
  text: string;
  title: string;
  url: string;
}

interface PythonScraperResult {
  success: boolean;
  articles?: DiffbotArticle[];
  metadata?: {
    timestamp: string;
    source_url: string;
    title: string;
  };
  error?: string;
}

export class NewsScraper {
  private storage: typeof SupabaseStorage;
  private pythonPath: string;
  private lastProcessedTitle: string | null = null;

  constructor() {
    this.storage = new SupabaseStorage();
    this.pythonPath = path.join(__dirname, 'scraper.py');
  }

  async checkForNewNews(): Promise<void> {
    try {
      const options = {
        mode: 'text',
        pythonPath: 'python3',
        pythonOptions: ['-u'], // unbuffered output
        scriptPath: __dirname,
        env: {
          ...process.env,
          DIFFBOT_TOKEN: process.env.DIFFBOT_TOKEN || process.env.VITE_DIFFBOT_TOKEN
        }
      };

      logger.info('Starting Python scraper...');
      const output = await PythonShell.run(this.pythonPath, options);
      
      // Get the last line which contains our JSON
      const lastLine = output[output.length - 1];
      const result: PythonScraperResult = JSON.parse(lastLine);

      if (!result.success) {
        logger.error('Python scraper failed:', result.error);
        return;
      }

      if (result.articles && result.metadata) {
        // Check if this is a new article
        if (this.lastProcessedTitle !== result.metadata.title) {
          this.lastProcessedTitle = result.metadata.title;
          
          // Transform articles to match your Supabase schema
          const articlesToStore = result.articles.map(article => ({
            title: article.title,
            content: article.text,
            url: article.url,
            publishedAt: article.date,
            source: 'Trading Economics',
            sentiment: {
              score: article.sentiment,
              label: this.getSentimentLabel(article.sentiment),
              confidence: Math.abs(article.sentiment)
            }
          }));

          await this.storage.storeArticles(articlesToStore);
          logger.info(`Stored ${articlesToStore.length} new articles`);
        } else {
          logger.info('No new articles detected');
        }
      }
    } catch (error) {
      logger.error('Failed to check for news:', error);
      throw error;
    }
  }

  private getSentimentLabel(score: number): string {
    if (score >= 0.1) return 'positive';
    if (score <= -0.1) return 'negative';
    return 'neutral';
  }
}