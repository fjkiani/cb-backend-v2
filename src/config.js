const config = {
  PORT: process.env.PORT || 3001,
  SCRAPING: {
    URL: 'https://tradingeconomics.com/stream?c=united+states',
    TIMEOUT: 60000,
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY: 2000,
    CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
  },
  CORS: {
    ORIGINS: process.env.NODE_ENV === 'production' 
      ? ['https://your-production-domain.com']
      : ['http://localhost:5173', 'http://localhost:5174'],
    METHODS: ['GET'],
    HEADERS: ['Content-Type'],
  }
};

export default config;