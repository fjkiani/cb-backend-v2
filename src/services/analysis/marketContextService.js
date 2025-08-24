import logger from '../../logger.js';
import { supabase } from '../../supabase/client.js';
import { getRedisClient } from '../redis/redisClient.js';
import { EconomicCalendarService } from '../calendar/EconomicCalendarService.js';
import { EarningsCalendarService } from '../calendar/EarningsCalendarService.js';
import { GoogleGenaiService } from './googleGenaiService.js';
import { getNewsAdapter } from '../news/NewsProviderFactory.js';
import { CohereService } from './cohere.js';
import { DiffbotService } from '../diffbot/DiffbotService.js';
import { get } from 'lodash-es';

// --- Constants --- 
const PREVIOUS_CONTEXT_DEFAULT = "No previous market context available.";
const NEWS_OVERVIEW_DEFAULT = "News overview not available.";
const RECENT_DAYS_FOR_CATALYSTS = 3; // Look ahead ~3 days for upcoming events
const REDIS_OVERVIEW_TE_KEY = 'overview:trading-economics';
const REDIS_OVERVIEW_RTNEWS_KEY = 'overview:realtime-news';
const SUPABASE_CONTEXT_TABLE = 'market_context';
const MAX_PREVIOUS_CONTEXT_LENGTH = 5000; // Max characters for previous context
const MAX_NEWS_OVERVIEW_LENGTH = 2000;    // Max characters for each news overview
const MAX_CATALYSTS_LENGTH = 1500;        // Max characters for each catalyst list

export class MarketContextService {
    constructor() {
        this.redisClient = getRedisClient();
        this.economicCalendarService = new EconomicCalendarService();
        this.earningsCalendarService = new EarningsCalendarService();
        this.googleGenaiService = new GoogleGenaiService();

        // For refreshing overviews - these might already be instantiated elsewhere
        // Consider dependency injection for a cleaner setup later.
        try {
            this.cohereService = new CohereService();

            // Correctly instantiate DiffbotService
            const diffbotToken = process.env.DIFFBOT_TOKEN;
            if (!diffbotToken) {
                logger.error('[MCS] Diffbot token (DIFFBOT_TOKEN) not found in environment variables.');
                throw new Error('Diffbot token is required for DiffbotService.'); // This will be caught below
            }
            this.diffbotService = new DiffbotService({ apiToken: diffbotToken }, logger); // Pass config and logger

        } catch (error) {
            // This catch block will now correctly report if Cohere key is missing OR if Diffbot token is missing
            logger.warn('[MCS] Could not instantiate CohereService or DiffbotService for overview refresh:', { 
                errorMessage: error.message,
                service: error.message.includes('Cohere') ? 'CohereService' : (error.message.includes('Diffbot') ? 'DiffbotService' : 'UnknownService')
            });
            if (error.message.includes('Cohere')) this.cohereService = null;
            if (error.message.includes('Diffbot')) this.diffbotService = null;
            // If it's a different error, both might remain in their default (potentially null) state if not yet assigned.
        }

        if (!this.redisClient) {
            logger.error('[MCS] Redis client is not available. MarketContextService may not function correctly.');
            throw new Error('Redis client failed to initialize for MarketContextService');
        }
        logger.info('[MCS] MarketContextService initialized.');
    }

    async _generateRealTimeNewsOverview() {
        if (!this.cohereService || !this.diffbotService) {
            logger.warn('[MCS] CohereService or DiffbotService for RealTimeNews overview refresh are not available.');
            return null;
        }
        try {
            logger.info('[MCS] Attempting to generate fresh RealTimeNews overview...');
            const adapter = getNewsAdapter('realtime-news');
            const articles = await adapter.searchNews({ query: 'general market news', limit: 20, sources: null, removeDuplicates: true });

            if (!articles || articles.length === 0) {
                logger.info('[MCS] No articles found from RealTimeNews for overview refresh.');
                return null;
            }

            const articleTitlesForTriage = articles.map(a => ({ url: a.url, title: a.title, publishedAt: a.publishedAt }));
            const keyUrls = await this.cohereService.triageArticleTitles(articleTitlesForTriage);
            logger.info(`[MCS] RealTimeNews Triage identified ${keyUrls.length} key URLs.`);

            if (!keyUrls || keyUrls.length === 0) return 'No key articles were identified from RealTimeNews.';

            const fetchedKeyArticles = [];
            for (const url of keyUrls) {
                const articleContent = await this.diffbotService.analyze(url);
                if (articleContent && articleContent.text) {
                    fetchedKeyArticles.push({ ...articleContent, url }); // Add URL back for context
                } else {
                    logger.warn(`[MCS] Failed to fetch or extract text for URL via Diffbot: ${url}`);
                }
            }

            if (fetchedKeyArticles.length === 0) return 'Content could not be fetched for key RealTimeNews articles.';

            const summaries = [];
            for (const article of fetchedKeyArticles) {
                const summary = await this.cohereService.analyzeArticle(article.text, article.title, 'summarize-xlarge');
                if (summary && summary.summary) {
                    summaries.push({ title: article.title, summary: summary.summary, url: article.url });
                } else {
                    logger.warn(`[MCS] Failed to summarize article: ${article.title}`);
                }
            }

            if (summaries.length === 0) return 'No summaries could be generated for key RealTimeNews articles.';

            // For synthesis, we use a simplified theme structure here
            const themes = [{ name: "General Market Update", articles: summaries.map(s => s.title) }]; 
            const finalOverview = await this.cohereService.synthesizeOverview(themes, summaries, 'Generate a concise market overview based on these summaries.');
            
            logger.info('[MCS] Successfully generated fresh RealTimeNews overview.', { length: finalOverview?.length });
            return finalOverview;

        } catch (error) {
            logger.error('[MCS] Error during _generateRealTimeNewsOverview:', error);
            return null;
        }
    }

    async generateAndStoreContext(forceRefreshOverviews = false) {
        logger.info(`[MCS] Starting market context generation. Force refresh overviews: ${forceRefreshOverviews}`);
        let teOverview = null;
        let rtNewsOverview = null;

        if (forceRefreshOverviews) {
            try {
                const freshRtOverview = await this._generateRealTimeNewsOverview();
                if (freshRtOverview) {
                    await this.redisClient.set('overview:realtime-news', freshRtOverview, { EX: 3600 });
                    logger.info('[MCS] Successfully refreshed and cached RealTimeNews overview in Redis.');
                    rtNewsOverview = freshRtOverview;
                }
            } catch (error) {
                logger.error('[MCS] Error refreshing RealTimeNews overview during main generation flow:', error);
            }

            // Placeholder for Trading Economics refresh - this is more complex
            // as it depends on the Python scraper's output which is typically in Supabase.
            // For now, we'll skip force-refreshing TE overview here.
            logger.warn('[MCS] Trading Economics overview force refresh is not yet implemented in this flow.');
        }

        // Fetch overviews from cache (either just refreshed or existing)
        if (!rtNewsOverview) rtNewsOverview = await this.redisClient.get('overview:realtime-news');
        if (!teOverview) teOverview = await this.redisClient.get('overview:trading-economics');

        // Fetch Previous Context
        const previousContextData = await supabase
            .from('market_context')
            .select('context_text, generated_at')
            .order('generated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        const previousContext = previousContextData.data?.context_text 
            ? previousContextData.data.context_text.slice(0, MAX_PREVIOUS_CONTEXT_LENGTH) 
            : 'No previous market context available.';
        logger.info(`[MCS] Fetched previous market context. Length: ${previousContext.length}, Generated At: ${previousContextData.data?.generated_at || 'N/A'}`);
        
        // Fetch News Overviews from Redis (these might have been refreshed above)
        const finalRtNewsOverview = rtNewsOverview ? rtNewsOverview.slice(0, MAX_NEWS_OVERVIEW_LENGTH) : 'RealTimeNews overview is currently unavailable.';
        const finalTeOverview = teOverview ? teOverview.slice(0, MAX_NEWS_OVERVIEW_LENGTH) : 'Trading Economics overview is currently unavailable.';
        logger.info('[MCS] Fetched cached news overviews.', { 
            rtLength: finalRtNewsOverview.length, 
            teLength: finalTeOverview.length 
        });

        // Fetch Upcoming Economic Catalysts (next 7 days, high importance)
        const economicCatalysts = await this.economicCalendarService.fetchEventsForContext();
        const economicCatalystsText = economicCatalysts.length > 0 
            ? economicCatalysts.map(e => `- ${e.date} (${e.country}): ${e.indicator} (Importance: ${e.importance}, Forecast: ${e.forecast || 'N/A'}, Previous: ${e.previous || 'N/A'})`).join('\n')
            : 'No significant economic catalysts upcoming in the next 7 days.';
        logger.info(`[MCS] Fetched ${economicCatalysts.length} upcoming economic catalysts.`);

        // Fetch Upcoming Earnings Catalysts (next 7 days, any company for now)
        const earningsCatalysts = await this.earningsCalendarService.fetchEventsForContext(); // Assumes this method exists and fetches relevant data
        const earningsCatalystsText = earningsCatalysts.length > 0 
            ? earningsCatalysts.map(e => `- ${e.date}: ${e.symbol} (EPS Est: ${e.epsEstimated || 'N/A'})`).join('\n')
            : 'No significant earnings releases upcoming in the next 7 days.';
        logger.info(`[MCS] Fetched ${earningsCatalysts.length} upcoming earnings catalysts.`);
        
        const prompt = this.buildContextPrompt(
            previousContext,
            finalRtNewsOverview,
            finalTeOverview,
            economicCatalystsText.slice(0, MAX_CATALYSTS_LENGTH),
            earningsCatalystsText.slice(0, MAX_CATALYSTS_LENGTH)
        );
        logger.debug('[MCS] Built context prompt. Length:', prompt.length);

        // Call LLM (Gemini)
        logger.debug('[MCS] Calling GoogleGenaiService.generateText for market context...');
        const llmResult = await this.googleGenaiService.generateText(prompt);
        let success, contextText, error;

        if (llmResult) {
            success = llmResult.success;
            contextText = llmResult.text; // 'text' is the field in the new method's return
            error = llmResult.error;
        } else {
            // Fallback if llmResult is unexpectedly null or undefined
            success = false;
            contextText = null;
            error = 'LLM service returned an unexpected null/undefined result.';
            logger.error('[MCS] GoogleGenaiService.generateText returned null or undefined.');
        }

        if (success && contextText) {
            const { data: newContext, error: insertError } = await supabase
                .from('market_context')
                .insert([{ context_text: contextText }])
                .select()
                .single();

            if (insertError) {
                logger.error('[MCS] Failed to store new market context in Supabase:', insertError);
                return { success: false, error: 'Database store failed' };
            }
            logger.info('[MCS] Successfully generated and stored new market context.', { newContextId: newContext.id, textLength: contextText.length });
            return { success: true, newContextId: newContext.id };
        } else {
            logger.error('[MCS] LLM failed to generate market context:', error);
            return { success: false, error: error || 'LLM generation failed' };
        }
    }

    buildContextPrompt(previousContext, rtNewsOverview, teOverview, economicCatalysts, earningsCatalysts) {
        let promptText = "You are a financial market analyst. Generate a concise yet comprehensive 'Overall Market Context' summary.";
        promptText += "\n\nConsider the following information sections provided. If a section is unavailable, note that.";
        promptText += "\n\nYour output should have two main sections: '1. Updated Summary' and '2. Key Takeaways / Areas to Monitor'.";
        promptText += "\nIn the 'Updated Summary', compare the current situation (from latest news overviews and catalysts) to the 'Previous Context', explicitly noting continuations or changes in market narrative, sentiment, and key driving factors.";
        promptText += "\nIn 'Key Takeaways', list bullet points of critical factors, upcoming events, or data points that traders and analysts should be watching closely.";

        promptText += "\n\n--- Previous Market Context ---";
        promptText += `\n${previousContext}`; 

        promptText += "\n\n--- Latest RealTimeNews Overview ---";
        promptText += `\n${rtNewsOverview}`;

        promptText += "\n\n--- Latest Trading Economics Overview ---";
        promptText += `\n${teOverview}`;

        promptText += "\n\n--- Upcoming Economic Catalysts (Next 7 Days) ---";
        promptText += `\n${economicCatalysts}`;

        promptText += "\n\n--- Upcoming Earnings Catalysts (Next 7 Days) ---";
        promptText += `\n${earningsCatalysts}`;
        
        // Add a timestamp to the prompt to encourage variation and acknowledge freshness:
        promptText += `\n\n--- Current Generation Request Time ---`;
        promptText += `\nThis context is being generated at: ${new Date().toISOString()}.`;
        promptText += "\nPlease ensure your analysis is fresh and reflects the very latest understanding based on all inputs, highlighting how today's available news (if any) has evolved the situation from the previous context.";

        promptText += "\n\n--- Output Structure --- ";
        promptText += "\n**1. Updated Summary:**\n[Your synthesized summary here, comparing to previous context and incorporating new inputs.]";
        promptText += "\n\n**2. Key Takeaways / Areas to Monitor:**\n- [Takeaway 1 based on all inputs]\n- [Takeaway 2 based on all inputs]";

        return promptText;
    }
} 