import logger from '../../logger.js';
import { RealTimeNewsAdapter } from './adapters/RealTimeNewsAdapter.js';
// Import other adapters here when created
// import { TradingEconomicsAdapter } from './adapters/TradingEconomicsAdapter.js';

const adapters = {
  RealTimeNews: RealTimeNewsAdapter,
  // TradingEconomics: TradingEconomicsAdapter,
};

// Cache instances
const adapterInstances = {};

export function getNewsAdapter(sourceName) {
  if (adapterInstances[sourceName]) {
    return adapterInstances[sourceName];
  }

  const AdapterClass = adapters[sourceName];
  if (!AdapterClass) {
    logger.error(`No news adapter found for source: ${sourceName}`);
    throw new Error(`Unsupported news source: ${sourceName}`);
  }

  try {
    adapterInstances[sourceName] = new AdapterClass();
    logger.info(`Initialized adapter for ${sourceName}`);
    return adapterInstances[sourceName];
  } catch (error) {
     logger.error(`Failed to initialize adapter for ${sourceName}: ${error.message}`);
     throw error; // Re-throw initialization errors
  }
}

// Optional: A function to get all available/configured source names
export function getAvailableSources() {
    return Object.keys(adapters);
} 