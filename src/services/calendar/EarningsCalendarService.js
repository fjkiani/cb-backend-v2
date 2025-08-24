import axios from 'axios';
import logger from '../../logger.js';
import { redis } from '../../routes/analysis.js'; // Import the shared Redis client
import { get } from 'lodash-es'; // Import lodash get for safe path access

// Financial Modeling Prep API details (for Calendar range)
const FMP_API_URL = 'https://financialmodelingprep.com/stable';
const EARNINGS_CALENDAR_ENDPOINT = '/earnings-calendar';
const EARNINGS_CACHE_DURATION_SECONDS = 6 * 3600; 

// Mboum Finance API details (for Historical Earnings)
const MBOUM_API_HOST = 'mboum-finance.p.rapidapi.com';
const MBOUM_API_BASE_URL = `https://${MBOUM_API_HOST}/v1`;
const MBOUM_HISTORICAL_ENDPOINT = '/markets/stock/modules';
const HISTORICAL_CACHE_DURATION_SECONDS = 12 * 3600; 

export class EarningsCalendarService {
    constructor() {
        // Use FMP API Key for calendar
        this.fmpApiKey = process.env.FMP_API_KEY; 
        if (!this.fmpApiKey) {
            logger.error('FMP API Key not found in environment variable: FMP_API_KEY');
            throw new Error('API Key configuration error for FMP Earnings Service');
        }
        // Use Mboum API Key for history
        this.mboumApiKey = process.env.MBOUM_RAPIDAPI_KEY;
         if (!this.mboumApiKey) {
            logger.error('Mboum RapidAPI Key not found in environment variable: MBOUM_RAPIDAPI_KEY');
            // Don't throw, allow service to init, but history fetch will fail
            logger.warn('Historical earnings fetch will fail due to missing MBOUM_RAPIDAPI_KEY');
        }
        logger.info('EarningsCalendarService initialized with FMP (Calendar) and Mboum (History) keys');
    }

    /**
     * Fetches earnings calendar events from the FMP API.
     * @param {string} from - Start date in YYYY-MM-DD format.
     * @param {string} to - End date in YYYY-MM-DD format.
     * @returns {Promise<Array<object>>} - A promise that resolves to an array of earnings event objects.
     */
    async fetchEarnings(from, to) {
        const cacheKey = `earnings:fmp:calendar:${from}:${to}`;

        // 1. Check Cache
        if (redis) {
            try {
                const cachedData = await redis.get(cacheKey);
                if (cachedData) {
                    logger.info('FMP EarningsCalendarService (Calendar): Cache HIT', { key: cacheKey });
                    return JSON.parse(cachedData);
                }
            } catch (cacheError) {
                logger.error('FMP EarningsCalendarService (Calendar): Redis GET error', { key: cacheKey, error: cacheError });
            }
        } else {
            logger.debug('FMP EarningsCalendarService (Calendar): Redis not available, skipping cache');
        }
        
        logger.info('FMP EarningsCalendarService (Calendar): Cache MISS, fetching from API', { key: cacheKey });

        // 2. Fetch from FMP API
        const url = `${FMP_API_URL}${EARNINGS_CALENDAR_ENDPOINT}`;
        const params = {
            apikey: this.fmpApiKey,
            from: from,
            to: to,
        };
        
        const options = {
            method: 'GET',
            url: url,
            params: params,
            headers: { 'Accept': 'application/json' }
        };

        try {
            const response = await axios(options);

            if (!Array.isArray(response.data)) { 
                logger.error('FMP EarningsCalendarService (Calendar): Unexpected API response structure.', {
                    responseData: response.data 
                });
                if (response.data && response.data['Error Message']) {
                    throw new Error(`FMP API Error: ${response.data['Error Message']}`);
                }
                return []; 
            }

            const earnings = response.data;
            logger.info(`FMP EarningsCalendarService (Calendar): Successfully fetched ${earnings.length} events.`);
            
                        // 3. Store in Cache
            if (redis) {
                try {
                    const cacheDuration = earnings.length > 0 ? EARNINGS_CACHE_DURATION_SECONDS : 600;
                    await redis.set(cacheKey, JSON.stringify(earnings), 'EX', cacheDuration);
                    logger.info(`FMP EarningsCalendarService (Calendar): Result stored in cache.`, { key: cacheKey });
                } catch (cacheSetError) {
                    logger.error('FMP EarningsCalendarService (Calendar): Redis SET error', { key: cacheKey, error: cacheSetError });
                }
            } else {
                logger.debug('FMP EarningsCalendarService (Calendar): Redis not available, skipping cache storage');
            }
            
            return earnings; 

        } catch (error) {
            const fmpErrorMessage = error.response?.data?.['Error Message'];
            logger.error('FMP EarningsCalendarService (Calendar): Error fetching from API', {
                message: fmpErrorMessage || error.message,
                status: error.response?.status,
                data: error.response?.data,
                url: error.config?.url,
                params: { ...params, apikey: 'REDACTED' }
            });
            return []; 
        }
    }

    /**
     * Fetches historical earnings data for a specific symbol from the Mboum API.
     * @param {string} symbol - The stock symbol.
     * @returns {Promise<Array<object>>} - A promise that resolves to an array of mapped historical earnings objects.
     */
    async fetchHistoricalEarnings(symbol) {
        if (!symbol) {
            logger.warn('fetchHistoricalEarnings called with no symbol');
            return [];
        }
         if (!this.mboumApiKey) {
             logger.error(`Mboum API Key is missing. Cannot fetch history for ${symbol}.`);
             return [];
        }
        
        // Use Mboum cache key
        const cacheKey = `earnings:mboum:history:${symbol}`;

        // 1. Check Cache
        if (redis) {
            try {
                const cachedData = await redis.get(cacheKey);
                if (cachedData) {
                    logger.info('Mboum Earnings Service (History): Cache HIT', { key: cacheKey, symbol });
                    return JSON.parse(cachedData);
                }
            } catch (cacheError) {
                logger.error('Mboum Earnings Service (History): Redis GET error', { key: cacheKey, symbol, error: cacheError });
            }
        } else {
            logger.debug('Mboum Earnings Service (History): Redis not available, skipping cache');
        }

        logger.info('Mboum Earnings Service (History): Cache MISS, fetching from API', { key: cacheKey, symbol });

        // 2. Fetch from Mboum API
        const url = `${MBOUM_API_BASE_URL}${MBOUM_HISTORICAL_ENDPOINT}`;
        const params = {
            symbol: symbol,
            module: 'earnings' // Specify the module
        };
        const options = {
            method: 'GET',
            url: url,
            params: params,
            headers: { 
                'Accept': 'application/json',
                'x-rapidapi-host': MBOUM_API_HOST,
                'x-rapidapi-key': this.mboumApiKey
             }
        };

        try {
            const response = await axios(options);
            
            // Use lodash get to safely access nested quarterly data
            const quarterlyData = get(response.data, 'body.earnings.earningsChart.quarterly');

            if (!Array.isArray(quarterlyData)) {
                logger.warn('Mboum Earnings Service (History): Unexpected API response structure or no quarterly data.', {
                    symbol,
                    // Log a snippet of the received data if it exists
                    responseDataSnippet: JSON.stringify(response.data)?.substring(0, 200) + '...',
                    dataPathChecked: 'body.earnings.earningsChart.quarterly'
                });
                // Check for explicit Mboum error messages if needed
                if (response.data && response.data.message) {
                     logger.error(`Mboum API Error for ${symbol}: ${response.data.message}`);
                     // Decide if to throw or return empty based on error type
                }
                return [];
            }
            
            // Map Mboum structure to our expected format { date, epsActual, epsEstimated }
            // Ensure raw values exist and are numbers
            const mappedHistoricalEarnings = quarterlyData
                .map(q => ({ 
                    date: q.date, // Keep the quarter format (e.g., "3Q2020")
                    epsActual: (q.actual && typeof q.actual.raw === 'number') ? q.actual.raw : null,
                    epsEstimated: (q.estimate && typeof q.estimate.raw === 'number') ? q.estimate.raw : null
                 }))
                .filter(q => q.epsActual !== null || q.epsEstimated !== null); // Keep if at least one value exists
            
            // Mboum data seems sorted oldest first, reverse it for consistency (newest first)
            mappedHistoricalEarnings.reverse(); 

            logger.info(`Mboum Earnings Service (History): Successfully fetched and mapped ${mappedHistoricalEarnings.length} historical records for ${symbol}.`);

            // 3. Store Mapped Data in Cache
            if (redis) {
                try {
                    const cacheDuration = mappedHistoricalEarnings.length > 0 ? HISTORICAL_CACHE_DURATION_SECONDS : 600;
                    await redis.set(cacheKey, JSON.stringify(mappedHistoricalEarnings), 'EX', cacheDuration);
                    logger.info(`Mboum Earnings Service (History): Result stored in cache for ${symbol}.`, { key: cacheKey });
                } catch (cacheSetError) {
                    logger.error('Mboum Earnings Service (History): Redis SET error', { key: cacheKey, symbol, error: cacheSetError });
                }
            } else {
                logger.debug('Mboum Earnings Service (History): Redis not available, skipping cache storage');
            }

            return mappedHistoricalEarnings;

        } catch (error) {
            logger.error('Mboum Earnings Service (History): Error fetching from API', {
                symbol,
                message: error.message || error.response?.data?.message || 'Unknown API error',
                status: error.response?.status,
                // Avoid logging full data/key in error
                url: error.config?.url,
                params: params
            });
            return [];
        }
    }

    /**
     * Fetches earnings trend data for a specific symbol from the Mboum API.
     * @param {string} symbol - The stock symbol.
     * @returns {Promise<Array<object>|null>} - A promise that resolves to the trend array or null if not found.
     */
    async fetchEarningsTrendData(symbol) {
        if (!symbol) {
            logger.warn('fetchEarningsTrendData called with no symbol');
            return null;
        }
         if (!this.mboumApiKey) {
             logger.error(`Mboum API Key is missing. Cannot fetch trend data for ${symbol}.`);
             return null;
        }
        
        // Use Mboum cache key for trend data
        const cacheKey = `earnings:mboum:trend:${symbol}`;

        // 1. Check Cache
        if (redis) {
            try {
                const cachedData = await redis.get(cacheKey);
                if (cachedData) {
                    logger.info('Mboum Earnings Service (Trend): Cache HIT', { key: cacheKey, symbol });
                    return JSON.parse(cachedData);
                }
            } catch (cacheError) {
                logger.error('Mboum Earnings Service (Trend): Redis GET error', { key: cacheKey, symbol, error: cacheError });
            }
        } else {
            logger.debug('Mboum Earnings Service (Trend): Redis not available, skipping cache');
        }

        logger.info('Mboum Earnings Service (Trend): Cache MISS, fetching from API', { key: cacheKey, symbol });

        // 2. Fetch from Mboum API
        const url = `${MBOUM_API_BASE_URL}${MBOUM_HISTORICAL_ENDPOINT}`;
        const params = {
            symbol: symbol,
            module: 'earnings-trend' // Specify the TREND module
        };
        const options = {
            method: 'GET',
            url: url,
            params: params,
            headers: { 
                'Accept': 'application/json',
                'x-rapidapi-host': MBOUM_API_HOST,
                'x-rapidapi-key': this.mboumApiKey
             }
        };

        try {
            const response = await axios(options);
            
            // Use lodash get to safely access nested trend data
            const trendData = get(response.data, 'body.trend');

            // Trend data is an array (or should be)
            if (!Array.isArray(trendData)) {
                logger.warn('Mboum Earnings Service (Trend): Unexpected API response structure or no trend data.', {
                    symbol,
                    responseDataSnippet: JSON.stringify(response.data)?.substring(0, 200) + '...',
                    dataPathChecked: 'body.trend'
                });
                if (response.data && response.data.message) {
                     logger.error(`Mboum API Error for ${symbol}: ${response.data.message}`);
                }
                return null; // Return null if trend data not found/invalid
            }

            logger.info(`Mboum Earnings Service (Trend): Successfully fetched ${trendData.length} trend periods for ${symbol}.`);

            // 3. Store Trend Data in Cache
            if (redis) {
                try {
                     // Cache even empty results briefly if API returned valid structure but empty array
                     const cacheDuration = trendData.length > 0 ? HISTORICAL_CACHE_DURATION_SECONDS : 600;
                     await redis.set(cacheKey, JSON.stringify(trendData), 'EX', cacheDuration);
                     logger.info(`Mboum Earnings Service (Trend): Result stored in cache for ${symbol}.`, { key: cacheKey });
                } catch (cacheSetError) {
                     logger.error('Mboum Earnings Service (Trend): Redis SET error', { key: cacheKey, symbol, error: cacheSetError });
                }
            } else {
                logger.debug('Mboum Earnings Service (Trend): Redis not available, skipping cache storage');
            }

            return trendData; // Return the raw trend array

        } catch (error) {
            logger.error('Mboum Earnings Service (Trend): Error fetching from API', {
                symbol,
                message: error.message || error.response?.data?.message || 'Unknown API error',
                status: error.response?.status,
                url: error.config?.url,
                params: params
            });
            return null; // Return null on API error
        }
    }

    async fetchEventsForContext(daysToFetch = 7) {
        logger.info(`[EarningsCalendarService] Fetching earnings events for context. Days: ${daysToFetch}`);
        const today = new Date();
        const endDate = new Date(today);
        endDate.setDate(today.getDate() + daysToFetch - 1); // -1 because 'to' is inclusive

        const fromDateString = today.toISOString().split('T')[0];
        const toDateString = endDate.toISOString().split('T')[0];

        let upcomingEarningsEvents = [];

        try {
            // fetchEarnings handles caching and fetching from FMP
            const rawEvents = await this.fetchEarnings(fromDateString, toDateString);

            if (rawEvents && rawEvents.length > 0) {
                // Ensure events are truly upcoming (FMP might return past events if 'from' is in past for a weekly range)
                // And map to a slightly more consistent structure if needed, though FMP is usually good.
                const now = new Date();
                now.setHours(0,0,0,0); // Normalize for date comparison

                upcomingEarningsEvents = rawEvents.filter(event => {
                    const eventDate = new Date(event.date);
                    return eventDate >= now; // Ensure event date is today or in the future
                });

                // Sort by date, then by symbol
                upcomingEarningsEvents.sort((a, b) => {
                    const dateA = new Date(a.date).getTime();
                    const dateB = new Date(b.date).getTime();
                    if (dateA !== dateB) {
                        return dateA - dateB;
                    }
                    return a.symbol.localeCompare(b.symbol);
                });
            }
        } catch (error) {
            logger.error(`[EarningsCalendarService] Error fetching earnings for context (${fromDateString} to ${toDateString}):`, error);
            // Return empty array on error
        }

        logger.info(`[EarningsCalendarService] Found ${upcomingEarningsEvents.length} upcoming earnings events for context.`);
        return upcomingEarningsEvents;
    }
}

// Export an instance
export default new EarningsCalendarService(); 