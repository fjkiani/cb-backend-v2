export const newsSourcesConfig = {
  RealTimeNews: {
    apiKeyEnvVar: 'REAL_TIME_NEWS_API_KEY', // Environment variable name for the key
    host: 'real-time-news-data.p.rapidapi.com',
    endpoints: {
      search: {
        path: '/search',
        requiredParams: ['query', 'limit'], // Parameters needed for a search call
        defaultParams: { country: 'US', lang: 'en', time_published: '7d' } // Default values if not provided
      }
      // Add other endpoints if needed later
    },
    // Path within the API JSON response where the article array is located
    dataPath: ['data'], 
    // Mapping from API response field names to our InternalArticle field names
    fieldMapping: { 
      title: 'title',
      url: 'link', // API uses 'link' for the URL
      publishedAt: 'published_datetime_utc', // API uses 'published_datetime_utc'
      content: null, // API doesn't provide full content in search results
      sourceName: 'RealTimeNews' // Set the source name
    }
  },
  // We will add TradingEconomics or other sources here later
}; 