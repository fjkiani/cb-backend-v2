import axios from 'axios';
import logger from '../../logger.js';
import { redis } from '../../routes/analysis.js'; // Import the shared Redis client

const CALENDAR_API_HOST = 'forex-api2.p.rapidapi.com';
const CALENDAR_API_ENDPOINT = '/economic-calendar';

// Mapping from new API volatility to our importance scale
const VOLATILITY_TO_IMPORTANCE = {
    NONE: -1, // Or some other value if NONE should be treated differently
    LOW: -1,
    MEDIUM: 0,
    HIGH: 1,
};

export class EconomicCalendarService {
    constructor() {
        this.apiKey = process.env.FOREX_API2_RAPIDAPI_KEY; 
        if (!this.apiKey) {
            logger.error('API Key not found in environment variable: FOREX_API2_RAPIDAPI_KEY for Calendar Service');
            throw new Error('API Key configuration error for Calendar Service');
        }
        logger.info('EconomicCalendarService initialized with forex-api2');
    }

    /**
     * Fetches economic events from the new Forex API (forex-api2.p.rapidapi.com).
     * Currently adapted for fetching a single day via startDate.
     * @param {string} startDate - Date in YYYY-MM-DD format.
     * @param {string[]} countries - Array of country codes (e.g., ['US', 'CA']). NOTE: New API might not filter by country in query param.
     * @returns {Promise<Array<object>>} - A promise that resolves to an array of event objects.
     */
    async fetchEvents(startDate, countries = ['US']) { // countries param can be removed or ignored if hardcoding to US
        const cacheKey = `calendar_v2:events:US:${startDate}`; // Add US to cache key for clarity

        if (redis) {
            try {
                const cachedData = await redis.get(cacheKey);
                if (cachedData) {
                    logger.info('EconomicCalendarService (v2): Cache HIT for US events', { key: cacheKey });
                    return JSON.parse(cachedData);
                }
            } catch (cacheError) {
                logger.error('EconomicCalendarService (v2): Redis GET error for US events', { key: cacheKey, error: cacheError });
            }
        } else {
            logger.debug('EconomicCalendarService (v2): Redis not available, skipping cache');
        }
        
        logger.info('EconomicCalendarService (v2): Cache MISS for US events, fetching from API', { key: cacheKey, date: startDate });

        const url = `https://${CALENDAR_API_HOST}${CALENDAR_API_ENDPOINT}`;
        const options = {
            method: 'GET',
            url: url,
            params: {
                from_date: startDate,
                to_date: startDate,
                includeVolatilities: 'NONE,LOW,MEDIUM,HIGH'
            },
            headers: {
                'X-RapidAPI-Key': this.apiKey,
                'X-RapidAPI-Host': CALENDAR_API_HOST,
                'Accept': 'application/json'
            }
        };

        try {
            const response = await axios(options);
            logger.debug('EconomicCalendarService (v2): Received response from RapidAPI', {
                status: response.status,
                // dataSnippet: JSON.stringify(response.data)?.substring(0, 200) + '...'
            });

            if (!response.data || !Array.isArray(response.data.calendarEntries)) { 
                logger.error('EconomicCalendarService (v2): Unexpected API response structure. Expected object with calendarEntries array.', {
                    responseData: response.data 
                });
                return []; 
            }

            const rawEvents = response.data.calendarEntries;

            const mappedEvents = rawEvents.map(event => ({
                id: event.id, 
                date: event.dateUtc, 
                country: event.countryCode,
                indicator: event.name,
                title: event.name, 
                importance: VOLATILITY_TO_IMPORTANCE[event.volatility?.toUpperCase()] ?? -1, 
                actual: event.actual,
                forecast: event.consensus, 
                previous: event.previous,
                unit: event.unit,
                currency: event.currencyCode, 
                revised: event.revised 
            }));

            // Filter for US events only
            const usEvents = mappedEvents.filter(event => event.country === 'US');

            logger.info(`EconomicCalendarService (v2): Fetched ${rawEvents.length} raw events, ${usEvents.length} US events for ${startDate}.`);
            
            // Cache duration logic (applied to usEvents)
            let cacheDurationInSeconds = 3600; 
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const reqDate = new Date(startDate);
            reqDate.setHours(0,0,0,0);

            const twoDaysAgo = new Date(today);
            twoDaysAgo.setDate(today.getDate() - 2);

            if (reqDate >= twoDaysAgo) { 
                cacheDurationInSeconds = 900; 
                logger.info('EconomicCalendarService (v2): Using shorter cache duration (15 min) for current/recent US data.', { key: cacheKey });
            }

            if (usEvents.length > 0) {
                if (redis) {
                    try {
                        await redis.set(cacheKey, JSON.stringify(usEvents), 'EX', cacheDurationInSeconds);
                        logger.info('EconomicCalendarService (v2): US events stored in cache', { key: cacheKey, duration: cacheDurationInSeconds });
                    } catch (cacheError) {
                        logger.error('EconomicCalendarService (v2): Redis SET error for US events', { key: cacheKey, error: cacheError });
                    }
                } else {
                    logger.debug('EconomicCalendarService (v2): Redis not available, skipping cache storage');
                }
            } else {
                logger.info('EconomicCalendarService (v2): No US events found for this date, not caching.', { key: cacheKey });
            }
            
            return usEvents; 

        } catch (error) {
            logger.error('EconomicCalendarService (v2): Error fetching events from API', {
                message: error.message,
                status: error.response?.status,
                // data: error.response?.data,
                url: error.config?.url,
                params: options.params
            });
            return []; 
        }
    }

    /**
     * Fetches the latest details for a single specific economic event using the new API structure.
     * It re-fetches all events for the original event's date and then finds the specific event by ID.
     * @param {object} originalEvent - The event object as known by the caller. 
     *                                 Expected to have at least `id` and `dateUtc` (e.g., "2025-06-04T11:00:00Z").
     * @returns {Promise<object|null>} - A promise that resolves to the fresh event object, or the original if not found/error.
     */
    async fetchSingleEventDetails(originalEvent) {
        if (!originalEvent || !originalEvent.id || !originalEvent.date) {
            logger.warn('EconomicCalendarService (v2): Insufficient details in originalEvent for fetchSingleEventDetails (requires id, date)', { originalEvent });
            return originalEvent; // Return original if we can't proceed
        }

        const eventDateISO = originalEvent.date.substring(0, 10); // Extract YYYY-MM-DD from ISO string

        logger.info('EconomicCalendarService (v2): Attempting to fetch fresh details for single event', {
             eventId: originalEvent.id, 
             eventIndicator: originalEvent.indicator, // indicator is from our mapped structure
             eventDate: eventDateISO 
        });

        try {
            const eventsForDay = await this.fetchEvents(eventDateISO);

            if (!eventsForDay || eventsForDay.length === 0) {
                logger.warn('EconomicCalendarService (v2): No events returned by fetchEvents for the day of the target event', { eventDateISO });
                return originalEvent; 
            }

            const foundEvent = eventsForDay.find(event => event.id === originalEvent.id);

            if (foundEvent) {
                logger.info('EconomicCalendarService (v2): Found fresh match for single event by ID within day\'s fetch', {
                    eventId: foundEvent.id,
                    indicator: foundEvent.indicator,
                    actual: foundEvent.actual
                });
                return foundEvent;
            } else {
                logger.warn('EconomicCalendarService (v2): Could not find specific event by ID in the day\'s fetch, returning original', {
                    targetEventId: originalEvent.id,
                    eventDateISO: eventDateISO // Corrected this line, was just eventDateISO
                });
                return originalEvent; 
            }
        } catch (error) {
            logger.error('EconomicCalendarService (v2): Error in fetchSingleEventDetails wrapper', {
                message: error.message,
                targetEventId: originalEvent.id,
                eventDateISO: eventDateISO // Corrected this line, was just eventDateISO
            });
            return originalEvent; 
        }
    }

    async fetchEventsForContext(daysToFetch = 7, minImportance = 0) {
        logger.info(`[EconomicCalendarService] Fetching events for context. Days: ${daysToFetch}, Min Importance: ${minImportance}`);
        const allUpcomingEvents = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of day

        for (let i = 0; i < daysToFetch; i++) {
            const targetDate = new Date(today);
            targetDate.setDate(today.getDate() + i);
            const dateString = targetDate.toISOString().split('T')[0];

            try {
                // fetchEvents already handles caching and returns US events
                const dailyEvents = await this.fetchEvents(dateString);
                if (dailyEvents && dailyEvents.length > 0) {
                    allUpcomingEvents.push(...dailyEvents);
                }
            } catch (error) {
                logger.error(`[EconomicCalendarService] Error fetching events for date ${dateString} in fetchEventsForContext:`, error);
                // Continue to next day even if one day fails
            }
        }

        // Filter by importance and ensure they are indeed upcoming (date check)
        // const now = new Date(); // 'now' is not strictly needed if comparing eventDate with 'today' (normalized)
        const significantUpcomingEvents = allUpcomingEvents.filter(event => {
            const eventDate = new Date(event.date);
            // Ensure event is on or after today and meets minimum importance
            return eventDate >= today && event.importance >= minImportance;
        });

        // Sort by date
        significantUpcomingEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        logger.info(`[EconomicCalendarService] Found ${significantUpcomingEvents.length} significant upcoming US economic events out of ${allUpcomingEvents.length} total fetched for context.`);
        return significantUpcomingEvents;
    }
} 