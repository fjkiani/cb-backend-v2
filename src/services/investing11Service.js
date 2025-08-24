import axios from 'axios';
import logger from '../logger.js';
import { supabase } from '../supabase/client.js';

const REAL_TIME_NEWS_API_KEY = '9f107deaabmsh2efbc3559ddca05p17f1abjsn271e6df32f7c'; // <-- IMPORTANT: Replace with your actual key
const REAL_TIME_NEWS_API_HOST = 'real-time-news-data.p.rapidapi.com';
const NEW_SOURCE_NAME = 'RealTimeNews'; // Define the new source name
const RATE_LIMIT_DELAY = 1500; // 1.5 seconds between requests
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
const MAX_DAILY_CALLS = 50;

export class RealTimeNewsService {
  constructor() {
    logger.info('RealTimeNewsService initialized');
    this.apiCallsToday = 0;
    this.lastReset = new Date().setHours(0,0,0,0);
  }

  isMarketHours() {
    const now = new Date();
    const nyTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hours = nyTime.getHours();
    const minutes = nyTime.getMinutes();
    const day = nyTime.getDay();

    // Check if it's a weekday (Monday-Friday)
    if (day === 0 || day === 6) return false;

    // Check if it's between 9:30 AM and 4:00 PM ET
    const marketOpen = hours > 9 || (hours === 9 && minutes >= 30);
    const marketClose = hours < 16;

    return marketOpen && marketClose;
  }

  async shouldMakeApiCall() {
    // Reset counter if it's a new day
    const today = new Date().setHours(0,0,0,0);
    if (today > this.lastReset) {
      this.apiCallsToday = 0;
      this.lastReset = today;
    }

    // Check if we've exceeded daily limit
    if (this.apiCallsToday >= MAX_DAILY_CALLS) {
      logger.warn('Daily API call limit reached:', { calls: this.apiCallsToday });
      return false;
    }

    // Check if we have recent cached results from the new source
    const { data: cachedArticles } = await supabase
      .from('articles')
      .select('created_at') // Only need timestamp for cache check
      .eq('source', NEW_SOURCE_NAME) // Use new source name
      .order('created_at', { ascending: false })
      .limit(1);

    if (cachedArticles && cachedArticles.length > 0) {
      const lastFetchTime = new Date(cachedArticles[0].created_at).getTime();
      const isCacheValid = Date.now() - lastFetchTime < CACHE_DURATION;
      
      if (isCacheValid) {
        logger.info(`Using cached ${NEW_SOURCE_NAME} results:`, { 
          lastFetch: new Date(lastFetchTime).toISOString() 
        });
        return false;
      }
    }

    return true;
  }

  async fetchNews(forceRefresh = false) {
    try {
      // Check cache first (unless force refresh is requested)
      if (!forceRefresh) {
        const { data: cachedArticles } = await supabase
          .from('articles')
          .select('*')
          .eq('source', NEW_SOURCE_NAME) // Use new source name
          .order('created_at', { ascending: false })
          .limit(20); // Fetching ~20 articles as mentioned

        // If we have recent cached articles, return them
        if (cachedArticles?.length > 0) {
          const mostRecent = new Date(cachedArticles[0].created_at).getTime();
          if (Date.now() - mostRecent < CACHE_DURATION) {
            logger.info(`Returning cached ${NEW_SOURCE_NAME} articles:`, { 
              count: cachedArticles.length,
              mostRecent: new Date(mostRecent).toISOString()
            });
            return cachedArticles;
          }
        }
      }

      // --- API Call Logic Updated ---
      logger.info(`Fetching fresh news from ${NEW_SOURCE_NAME} API`, { forceRefresh });
      
      // IMPORTANT: Verify the correct endpoint path from the API documentation
      const url = `https://${REAL_TIME_NEWS_API_HOST}/news`; 
      const options = {
        method: 'GET',
        url: url,
        headers: {
          'X-RapidAPI-Key': REAL_TIME_NEWS_API_KEY,
          'X-RapidAPI-Host': REAL_TIME_NEWS_API_HOST,
          'Accept': 'application/json'
        }
      };
      
      // Increment API call counter before making the call
      this.apiCallsToday++;
      logger.info('Making API call', { count: this.apiCallsToday });

      const response = await axios(options);
      // IMPORTANT: Verify the structure of the successful response
      // Assuming the data array is directly in response.data
      const rawNewsData = response.data.data; // Adjust if data is nested differently e.g., response.data.articles or response.data
      
      if (!rawNewsData || !Array.isArray(rawNewsData)) {
        logger.error('Unexpected API response structure:', { responseData: response.data });
        throw new Error('No data array found or invalid format in API response');
      }

      // --- Article Mapping Updated ---
      const articles = rawNewsData
        .filter(article => article && article.title && article.link && article.date)
        .map((article, index) => ({
          // Generate a unique enough ID, consider using a hash of url or title if available
          id: `${NEW_SOURCE_NAME}-${Date.now()}-${index}`,
          title: article.title,
          content: 'Content requires fetching', // Placeholder content
          url: article.link.startsWith('http') ? article.link : `https://${article.link}`, // Ensure URL has protocol
          published_at: new Date(article.published_datetime_utc).toISOString(), // Parse the date string
          source: NEW_SOURCE_NAME, // Use new source name
          category: 'Market News', // Default category, adjust as needed
          sentiment: null, // Sentiment analysis can be done later if needed
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }));
      // --- End Article Mapping Update ---

      logger.info(`Successfully fetched ${NEW_SOURCE_NAME} articles:`, {
        count: articles.length,
        sample: articles[0]?.title
      });

      // Store new articles
      if (articles.length > 0) {
        await this.storeArticles(articles);
      }

      return articles;
      // --- End API Call Logic Update ---

    } catch (error) {
      logger.error(`Error fetching ${NEW_SOURCE_NAME} news:`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        url: error.config?.url
      });
      // Don't re-throw; return empty array or handle error appropriately upstream
      return []; 
    }
  }

  async storeArticles(articles) {
    if (!articles || articles.length === 0) {
      logger.info('No articles provided to store.');
      return [];
    }
    try {
      logger.info('Storing articles in Supabase:', { count: articles.length });

      // Ensure the data structure matches Supabase schema
      const articlesToStore = articles.map(article => ({
        id: article.id,
        title: article.title,
        content: article.content,
        url: article.url,
        published_at: article.published_at, // Already in ISO format
        source: article.source,
        category: article.category,
        sentiment: article.sentiment, // Include sentiment if available/needed
        created_at: article.created_at,
        updated_at: article.updated_at
      }));

      const { data, error } = await supabase
        .from('articles')
        .upsert(articlesToStore, {
            onConflict: 'url', // Use URL as conflict target for uniqueness
            ignoreDuplicates: true // Avoid duplicate entries based on URL
          }
        );

      if (error) {
        // Log detailed Supabase error
        logger.error('Supabase upsert error:', { 
            message: error.message, 
            details: error.details, 
            hint: error.hint,
            code: error.code
         });
        throw error; // Re-throw after logging
      }

      logger.info('Successfully stored/updated articles:', {
        count: data?.length ?? 0, // Count might be null if nothing was upserted
        sample: articles[0]?.title // Log sample from input articles
      });

      return data || []; // Return data or empty array
    } catch (error) {
      // Catch errors not already caught by Supabase client
      logger.error('Error storing articles:', {
        message: error.message
      });
      throw error; // Re-throw
    }
  }
} 