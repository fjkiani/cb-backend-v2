import axios from 'axios';
// Removed ILogger and other type imports as they are not used in JS
// import { ILogger } from '../../types/logger';
// import { DiffbotConfig, DiffbotResponse } from './types';

export class DiffbotService {
  // Removed private and type annotations
  apiToken;
  apiUrl;
  logger;

  constructor(config, logger) { // Removed type annotations
    this.apiToken = config.apiToken;
    this.apiUrl = config.apiUrl || 'https://api.diffbot.com/v3/analyze';
    this.logger = logger;
  }

  async analyze(url) { // Removed type annotations
    try {
      // Removed generic type <DiffbotResponse> from axios.get
      const response = await axios.get(this.apiUrl, {
        params: {
          token: this.apiToken,
          url: url,
          render: 'true'
        },
        timeout: 20000
      });
      
      this.logger.info(`Successfully analyzed URL: ${url}`);
      return response.data;
      
    } catch (error) {
      // Log concise error info
      this.logger.error('Diffbot analysis failed:', {
          message: error.message || 'Unknown Diffbot error',
          status: error.response?.status,
          url: url // Log the URL that failed
      });
      throw new Error(`Diffbot analysis failed for ${url}: ${error.message || error}`);
    }
  }
} 