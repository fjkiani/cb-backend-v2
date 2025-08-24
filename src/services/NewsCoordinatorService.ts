import { ILogger } from '../types/logger';
import { DiffbotService, DiffbotResponse } from './diffbot';
import { CacheService } from './redis/CacheService';
import { ChangeDetectionService, ChangeDetectionResult } from './monitoring';
import { SupabaseStorage } from './storage/supabase/supabaseStorage';
import { NewsClassificationService } from './newsClassificationService';
import { CohereService } from './cohereService';

interface NewsArticle {
  title: string;
  content: string;
  url: string;
  publishedAt: string;
  source: string;
  category: string;
  sentiment: {
    score: number;
    label: string;
    confidence: number;
  };
  summary: string;
  author: string;
  id: string;
  classification: any;
  analysis: any;
  importance: number;
  needsAttention: boolean;
}

interface ProcessedNewsResult {
  newArticles: NewsArticle[];
  totalProcessed: number;
  cached: boolean;
}

interface INewsCoordinatorService {
  processNews(): Promise<ProcessedNewsResult>;
}

export class NewsCoordinatorService implements INewsCoordinatorService {
  private changeDetection: ChangeDetectionService;
  private diffbot: DiffbotService;
  private cache: CacheService;
  private storage: SupabaseStorage;
  private logger: ILogger;
  private readonly CACHE_KEY = 'processed_articles';
  private readonly CACHE_TTL = 300; // 5 minutes in seconds
  private classificationService: NewsClassificationService;
  private cohereService: CohereService;

  constructor(
    changeDetection: ChangeDetectionService,
    diffbot: DiffbotService,
    cache: CacheService,
    storage: SupabaseStorage,
    logger: ILogger,
    classificationService: NewsClassificationService,
    cohereService: CohereService
  ) {
    this.changeDetection = changeDetection;
    this.diffbot = diffbot;
    this.cache = cache;
    this.storage = storage;
    this.logger = logger;
    this.classificationService = classificationService;
    this.cohereService = cohereService;
  }

  async processNews(): Promise<ProcessedNewsResult> {
    try {
      // First check cache
      const cachedArticles = await this.cache.get<NewsArticle[]>(this.CACHE_KEY);
      if (cachedArticles) {
        this.logger.info('Returning cached articles', { count: cachedArticles.length });
        return {
          newArticles: cachedArticles,
          totalProcessed: cachedArticles.length,
          cached: true
        };
      }

      // Check for changes
      const changeResult = await this.changeDetection.checkForChanges();
      
      if (!changeResult.hasChanged || !changeResult.articles) {
        this.logger.info('No new content detected');
        return {
          newArticles: [],
          totalProcessed: 0,
          cached: false
        };
      }

      // Get existing articles from Supabase for comparison
      const existingArticles = await this.storage.getRecentArticles();
      const existingUrls = new Set(existingArticles.map(a => a.url));

      // Process new articles
      const newArticles: NewsArticle[] = [];
      
      for (const article of changeResult.articles) {
        // Skip if we already have this article
        if (existingUrls.has(article.url)) {
          this.logger.debug('Skipping existing article', { url: article.url });
          continue;
        }

        // Get full article details from Diffbot
        const diffbotResult = await this.diffbot.analyze(article.url);
        
        if (diffbotResult.objects && diffbotResult.objects.length > 0) {
          const processedArticle = await this.processArticle(diffbotResult.objects[0], article);
          newArticles.push(processedArticle);
        }
      }

      // Store new articles in Supabase
      if (newArticles.length > 0) {
        await this.storage.storeArticles(newArticles);
        this.logger.info('Stored new articles', { count: newArticles.length });

        // Update cache with all articles (new + existing)
        const allArticles = [...newArticles, ...existingArticles];
        await this.cache.set(this.CACHE_KEY, allArticles, this.CACHE_TTL);
      }

      return {
        newArticles,
        totalProcessed: changeResult.articles.length,
        cached: false
      };

    } catch (error) {
      this.logger.error('News processing failed:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  async processArticle(article) {
    // 1. Add batching for similar articles
    const similarArticles = await this.findSimilarArticles(article);
    if (similarArticles.length > 0) {
      return this.batchAnalyze(similarArticles);
    }

    // 2. Add context from related articles
    const context = await this.buildArticleContext(article);
    
    // 3. Add market data enrichment
    const enrichedArticle = await this.enrichWithMarketData(article);

    return this.analyzeArticle({
      ...enrichedArticle,
      context,
      relatedArticles: similarArticles
    });
  }

  async buildArticleContext(article) {
    return {
      recentMarketMoves: await this.getRecentMarketData(),
      relatedNews: await this.getRelatedNews(article),
      sectorPerformance: await this.getSectorData(article)
    };
  }

  private async processArticle(diffbotObject: any, originalArticle: any): Promise<NewsArticle> {
    // 1. Historical Pattern Matching
    const historicalContext = await this.getHistoricalContext(diffbotObject.title);
    
    // 2. Market Movement Correlation
    const marketContext = await this.getMarketContext({
      sectors: diffbotObject.sectors,
      tickers: diffbotObject.tickers,
      timestamp: diffbotObject.timestamp
    });

    // 3. Enhanced Classification
    const classification = await this.classificationService.classifyArticle({
      content: diffbotObject.text,
      title: diffbotObject.title,
      historicalContext,
      marketContext
    });

    // 4. Rich Analysis for High-Impact News
    if (classification.needsImmediateAnalysis) {
      const enrichedAnalysis = await this.cohereService.analyzeArticle({
        title: diffbotObject.title,
        content: diffbotObject.text,
        classification,
        context: {
          historicalPatterns: historicalContext.patterns,
          marketMovements: marketContext.movements,
          relatedNews: await this.getRelatedNews(diffbotObject),
          sectorImpact: marketContext.sectorAnalysis
        }
      });

      return {
        ...this.processBasicArticle(diffbotObject, originalArticle),
        classification,
        analysis: enrichedAnalysis,
        marketContext,
        historicalContext,
        importance: classification.importance,
        needsAttention: true
      };
    }

    return {
      ...this.processBasicArticle(diffbotObject, originalArticle),
      classification,
      importance: classification.importance,
      needsAttention: false
    };
  }

  private processBasicArticle(diffbotObject: any, originalArticle: any): NewsArticle {
    return {
      title: diffbotObject.title || originalArticle.title,
      content: diffbotObject.text || '',
      url: diffbotObject.pageUrl || originalArticle.url,
      publishedAt: diffbotObject.date || originalArticle.publishedAt,
      source: 'Trading Economics',
      category: this.extractCategory(diffbotObject, originalArticle.url),
      sentiment: {
        score: diffbotObject.sentiment || 0,
        label: this.getSentimentLabel(diffbotObject.sentiment || 0),
        confidence: Math.abs(diffbotObject.sentiment || 0)
      },
      summary: diffbotObject.text || '',
      author: diffbotObject.author || 'Trading Economics',
      id: this.generateArticleId(originalArticle.title, originalArticle.url),
      classification: null,
      analysis: null,
      importance: 0,
      needsAttention: false
    };
  }

  private extractCategory(diffbotObject: any, url: string): string {
    try {
      const urlParams = new URL(url).searchParams;
      if (urlParams.has('i')) {
        return urlParams.get('i') || 'General';
      }
      if (diffbotObject.title?.toLowerCase().includes('market')) {
        return 'Markets';
      }
      if (diffbotObject.title?.toLowerCase().includes('economic')) {
        return 'Economic';
      }
      return 'General';
    } catch {
      return 'General';
    }
  }

  private getSentimentLabel(score: number): string {
    if (score >= 0.5) return 'positive';
    if (score <= -0.5) return 'negative';
    return 'neutral';
  }

  private generateArticleId(title: string, url: string): string {
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(`${url}${title}`).digest('hex');
    return `te-${hash}`;
  }

  private async getHistoricalContext(title: string) {
    return {
      patterns: await this.patternMatcher.findSimilarEvents(title),
      previousImpacts: await this.impactAnalyzer.getPastImpacts(title),
      trendAnalysis: await this.trendAnalyzer.analyzeTrends(title)
    };
  }

  private async getMarketContext({ sectors, tickers, timestamp }) {
    return {
      movements: await this.marketDataService.getMovements(tickers),
      sectorAnalysis: await this.sectorAnalyzer.analyzeSectors(sectors),
      correlations: await this.correlationAnalyzer.findCorrelations({
        tickers,
        timestamp
      })
    };
  }

  private async processHighImpactNews(article: any, classification: any): Promise<NewsArticle> {
    // Only process if truly high impact
    if (classification.importance >= 4) {  // High threshold
      try {
        // 1. Quick Market Reaction Check
        const marketReaction = await this.marketDataService.getImmediateReaction({
          tickers: this.extractTickers(article.content),
          timestamp: article.publishedAt,
          timeWindow: '15m'  // Check last 15 minutes
        });

        // 2. Related High Impact News
        const relatedHighImpactNews = await this.storage.findSimilarHighImpactNews({
          title: article.title,
          category: article.category,
          lookbackHours: 24
        });

        // 3. Enhanced Cohere Analysis with Market Context
        const enrichedAnalysis = await this.cohereService.analyzeArticle({
          title: article.title,
          content: article.content,
          classification,
          context: {
            marketReaction,
            relatedHighImpactNews,
            urgencyLevel: this.calculateUrgency({
              importance: classification.importance,
              marketReaction,
              relatedNews: relatedHighImpactNews
            })
          }
        });

        return {
          ...article,
          classification,
          analysis: enrichedAnalysis,
          marketImpact: {
            immediate: marketReaction,
            related: relatedHighImpactNews.map(news => ({
              title: news.title,
              impact: news.marketImpact
            }))
          },
          urgencyLevel: enrichedAnalysis.urgencyLevel,
          needsAttention: true,
          alertPriority: this.calculateAlertPriority(enrichedAnalysis)
        };
      } catch (error) {
        this.logger.error('High impact news processing failed:', {
          title: article.title,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
      }
    }

    // Return basic article if not high impact
    return {
      ...article,
      classification,
      needsAttention: false
    };
  }

  private calculateUrgency({ importance, marketReaction, relatedNews }): 'critical' | 'high' | 'medium' {
    if (importance === 5 || marketReaction.volatility > 2) return 'critical';
    if (importance === 4 || relatedNews.length > 3) return 'high';
    return 'medium';
  }

  private calculateAlertPriority(analysis: any): number {
    const factors = {
      marketImpact: analysis.marketImpact?.immediate?.severity || 0,
      urgencyLevel: analysis.urgencyLevel === 'critical' ? 2 : 1,
      sectorScope: analysis.marketImpact?.affectedSectors?.length || 0
    };
    
    return Math.min(5, 
      factors.marketImpact * 1.5 + 
      factors.urgencyLevel * 1.2 + 
      factors.sectorScope * 0.3
    );
  }
} 