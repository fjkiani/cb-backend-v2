import axios from 'axios';
import logger from '../../../logger.js'; // Adjusted path
import { newsSourcesConfig } from '../../../config/newsSources.config.js'; // Adjusted path
import { get } from 'lodash-es'; // Use lodash-es for ESM compatibility
import { ArticleStorageService } from '../../storage/ArticleStorageService.js'; // Import storage service

// Helper function to map API response to InternalArticle format
const mapToInternalArticle = (apiArticle, mapping) => {
  const internalArticle = {};
  for (const internalKey in mapping) {
    const apiKey = mapping[internalKey];
    if (apiKey === null) {
      // Handle fields not directly present (like content)
      internalArticle[internalKey] = internalKey === 'content' ? 'Content requires fetching' : undefined;
    } else if (typeof apiKey === 'string' && apiKey in apiArticle) {
      // Direct mapping
      internalArticle[internalKey] = apiArticle[apiKey];
    } else if (internalKey === 'sourceName') {
      // Handle constant source name mapping
      internalArticle[internalKey] = apiKey; 
    }
    // Add more complex mapping logic if needed (e.g., date parsing)
    if (internalKey === 'publishedAt' && internalArticle[internalKey]) {
       try {
         internalArticle[internalKey] = new Date(internalArticle[internalKey]).toISOString();
       } catch (e) {
         logger.warn('Failed to parse date for article', { title: internalArticle.title, date: internalArticle[internalKey] });
         internalArticle[internalKey] = new Date().toISOString(); // Fallback date
       }
    }
    if (internalKey === 'url' && internalArticle[internalKey] && !internalArticle[internalKey].startsWith('http')) {
        internalArticle[internalKey] = `https://${internalArticle[internalKey]}`;
    }
  }
  // Add default fields
  internalArticle.createdAt = new Date().toISOString();
  internalArticle.updatedAt = new Date().toISOString();
  
  // Basic validation - ensure core fields are present
  if (!internalArticle.title || !internalArticle.url || !internalArticle.publishedAt) {
      logger.warn('Skipping article due to missing core fields after mapping', { apiArticle, internalArticle });
      return null;
  }
  
  return internalArticle; // Should implicitly match InternalArticle type
};


export class RealTimeNewsAdapter { // Implements INewsProvider implicitly
  constructor() {
    this.config = newsSourcesConfig.RealTimeNews;
    this.apiKey = process.env[this.config.apiKeyEnvVar];
    if (!this.apiKey) {
      logger.error(`API Key not found in environment variable: ${this.config.apiKeyEnvVar}`);
      throw new Error(`API Key configuration error for ${this.config.apiKeyEnvVar}`);
    }
    this.storageService = new ArticleStorageService(); // Instantiate storage service
    logger.info('RealTimeNewsAdapter initialized with ArticleStorageService');
  }

  async searchNews(params) {
    const endpointConfig = this.config.endpoints.search;
    if (!endpointConfig) {
      logger.error('Search endpoint not configured for RealTimeNews');
      return [];
    }

    // Ensure required params are present
    if (!params.query) {
        logger.warn('Query parameter is required for RealTimeNews search');
        // Use a default or return empty based on requirements
        params.query = 'Market News'; 
    }
     if (!params.limit) {
        params.limit = 20; // Default limit
    }

    const requestParams = {
      ...endpointConfig.defaultParams,
      query: params.query,
      limit: params.limit,
      // Add any other params passed in 'params' that are valid for this endpoint
    };

    const url = `https://${this.config.host}${endpointConfig.path}`;
    const options = {
      method: 'GET',
      url: url,
      params: requestParams,
      headers: {
        'X-RapidAPI-Key': this.apiKey,
        'X-RapidAPI-Host': this.config.host,
        'Accept': 'application/json'
      }
    };

    logger.info('RealTimeNewsAdapter: Making API call to /search', { params: requestParams });

    try {
      const response = await axios(options);
      
      // Safely get the data array using the configured path (e.g., response.data.data)
      // Using lodash get for safe nested access
      const rawNewsData = get(response, ['data', ...this.config.dataPath], null); 

      if (!rawNewsData || !Array.isArray(rawNewsData)) {
        logger.error('RealTimeNewsAdapter: Unexpected API response structure.', { 
            responseData: response.data, 
            expectedPath: this.config.dataPath.join('.') 
        });
        return [];
      }

      const articles = rawNewsData
        .map(apiArticle => mapToInternalArticle(apiArticle, this.config.fieldMapping))
        .filter(article => article !== null); // Filter out articles that failed mapping/validation

      // --- Debugging Sort --- 
      logger.debug('RealTimeNewsAdapter: Articles BEFORE sort', { 
          titlesAndDates: articles.map(a => ({ title: a.title, publishedAt: a.publishedAt })) 
      });
      
      // Sort articles by publishedAt date, latest first
      articles.sort((a, b) => {
        try {
          const dateA = new Date(a.publishedAt).getTime();
          const dateB = new Date(b.publishedAt).getTime();
          // Compare dates in descending order
          if (isNaN(dateA) || isNaN(dateB)) {
              logger.warn('Invalid date encountered during sort', { dateA: a.publishedAt, dateB: b.publishedAt });
              return 0; // Don't change order if dates are bad
          }
          return dateB - dateA;
        } catch (e) {
          // Handle potential unexpected errors during date parsing/comparison
          logger.warn('Error comparing dates during sort', { dateA: a.publishedAt, dateB: b.publishedAt, error: e });
          return 0; // Keep original order on error
        }
      });

      logger.debug('RealTimeNewsAdapter: Articles AFTER sort', { 
          titlesAndDates: articles.map(a => ({ title: a.title, publishedAt: a.publishedAt })) 
      });
      // --- End Debugging Sort --- 

      logger.info(`RealTimeNewsAdapter: Successfully fetched and sorted articles.`, {
        count: articles.length,
        sample: articles[0]?.title
      });
      
      // Store the fetched and mapped articles using the storage service
      if (articles.length > 0) {
          try {
              await this.storageService.storeArticles(articles);
          } catch(storageError) {
              // Log storage error but don't fail the fetch operation
              logger.error('RealTimeNewsAdapter: Failed to store fetched articles', storageError);
          }
      }
      
      return articles; // Should return Promise<InternalArticle[]>

    } catch (error) {
      logger.error(`RealTimeNewsAdapter: Error fetching news`, {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
        url: error.config?.url,
        params: requestParams
      });
      return []; // Return empty on error
    }
  }
  
  // Implement other INewsProvider methods here if needed
} 