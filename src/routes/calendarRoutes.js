import express from 'express';
import logger from '../logger.js';
import { EconomicCalendarService } from '../services/calendar/EconomicCalendarService.js';
// Import the shared Google Genai service
import { googleGenaiService } from './analysis.js'; 
// Import the Earnings Calendar service
import earningsCalendarService from '../services/calendar/EarningsCalendarService.js';

const router = express.Router();

// Instantiate the service (consider dependency injection later for better testability)
let calendarService;
try {
    calendarService = new EconomicCalendarService();
} catch (error) {
    logger.error('Failed to instantiate EconomicCalendarService in routes:', error);
    // If the service fails, the routes using it won't work.
    calendarService = null; 
}

// GET /api/calendar/events
router.get('/events', async (req, res) => {
    logger.info('GET /api/calendar/events (v2, US-only, range-enabled) handler reached');

    if (!calendarService) {
        logger.error('Calendar service (v2) is not available.');
        return res.status(503).json({ error: 'Calendar service unavailable' });
    }

    // --- Parameter Validation (for date range) --- 
    const { from, to } = req.query; // Expect 'from' & 'to' for date range

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!from || !dateRegex.test(from)) {
        return res.status(400).json({ error: 'Invalid or missing "from" date parameter. Use YYYY-MM-DD format.' });
    }
    if (!to || !dateRegex.test(to)) {
        return res.status(400).json({ error: 'Invalid or missing "to" date parameter. Use YYYY-MM-DD format.' });
    }

    const startDate = new Date(from);
    const endDate = new Date(to);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return res.status(400).json({ error: 'Invalid date format in "from" or "to" parameter.' });
    }

    if (endDate < startDate) {
        return res.status(400).json({ error: '"to" date must be after or same as "from" date.' });
    }

    // Limit date range to prevent excessive calls (e.g., 31 days max)
    const diffTime = Math.abs(endDate - startDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end day
    if (diffDays > 31) {
        return res.status(400).json({ error: 'Date range too large. Maximum 31 days allowed.' });
    }
    // --- End Parameter Validation ---

    try {
        let allEventsInRange = [];
        const fetchPromises = [];

        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const currentDateString = d.toISOString().split('T')[0];
            // The service now internally filters for US, so no need to pass country list here
            fetchPromises.push(calendarService.fetchEvents(currentDateString));
        }

        const dailyEventArrays = await Promise.all(fetchPromises);
        dailyEventArrays.forEach(dailyEvents => {
            if (Array.isArray(dailyEvents)) {
                allEventsInRange.push(...dailyEvents);
            }
        });

        // Sort all collected events by date
        allEventsInRange.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        logger.debug('Data being sent to frontend in /api/calendar/events (v2, US-only, range)', { 
            fromQuery: from,
            toQuery: to,
            eventCount: allEventsInRange.length,
            sample: allEventsInRange.slice(0, 2) 
        });
        
        res.json({ 
            events: allEventsInRange, 
            message: `Fetched US events from ${from} to ${to} using new API.`, 
            timestamp: new Date().toISOString()
        });

    } catch (error) { 
        logger.error(`Error in calendar events route (v2, US-only, range):`, { message: error.message, stack: error.stack });
        res.status(500).json({ 
            error: 'Failed to fetch calendar events (v2)',
            message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : error.message 
        });
    }
});

// POST /api/calendar/interpret-event
router.post('/interpret-event', async (req, res) => {
    logger.info('POST /api/calendar/interpret-event handler reached');

    if (!calendarService || !googleGenaiService) {
        return res.status(503).json({ error: 'Dependent service unavailable' });
    }

    const { event: originalEventFromRequest, overallContext } = req.body;
    if (!originalEventFromRequest || !originalEventFromRequest.indicator) {
        return res.status(400).json({ error: 'Invalid event data provided' });
    }

    let eventForAnalysis; // Declare here

    try {
        // --- Get latest event data ---
        logger.debug('Fetching fresh data for event interpretation', { indicator: originalEventFromRequest.indicator });
        eventForAnalysis = await calendarService.fetchSingleEventDetails(originalEventFromRequest);
        
        if (!eventForAnalysis) {
            logger.warn('Could not find a fresh version of the event, using original request data.', { indicator: originalEventFromRequest.indicator });
            eventForAnalysis = { ...originalEventFromRequest, isStale: true };
        } else {
            logger.info('Successfully fetched fresh data for event', { indicator: eventForAnalysis.indicator });
        }

        // --- Build Contextual Prompt --- 
        const isPastEvent = eventForAnalysis.actual !== null && eventForAnalysis.actual !== undefined && eventForAnalysis.actual !== '';
        
        // Start prompt with the overall context
        let promptContext = `Current Overall Market Context:
===
${overallContext}
===

`; 
        
        promptContext += `Specific Event Details:
Indicator: ${eventForAnalysis.indicator} (${eventForAnalysis.country})
Period: ${eventForAnalysis.period ?? 'N/A'}
Unit: ${eventForAnalysis.unit ?? 'N/A'}
`;

        if (isPastEvent) {
            promptContext += `Status: Happened
Actual: ${eventForAnalysis.actual}
Forecast: ${eventForAnalysis.forecast ?? 'N/A'}
Previous: ${eventForAnalysis.previous ?? 'N/A'}
`;
            // Refined Task instruction for PAST events
            promptContext += `
Task: Based *strictly* on the Specific Event Details and the Current Overall Market Context provided above, explain the significance of this *actual* event result compared to the forecast/previous data. **Specifically, relate this outcome to the key themes or sentiment described in the Overall Market Context.** How might this result confirm, contradict, or modify the overall market picture presented?`;
        } else {
            promptContext += `Status: Upcoming
Forecast: ${eventForAnalysis.forecast ?? 'N/A'}
Previous: ${eventForAnalysis.previous ?? 'N/A'}
`;
            // Refined Task instruction for UPCOMING events
            promptContext += `
Task: Based *strictly* on the Specific Event Details and the Current Overall Market Context provided above, explain the potential significance of this *upcoming* release. **Specifically, relate the potential impact (if met, beat, or missed) to the key themes or sentiment described in the Overall Market Context.** How might different outcomes influence the overall market picture presented?`;
        }

        // Combine context and instructions for the final prompt
        const prompt = `${promptContext}

Keep the explanation concise (2-4 sentences) and focused strictly on information inferable from the provided context. Do not introduce external information or give financial advice.`;

        // --- Call LLM --- 
        logger.debug('Sending contextual event interpretation prompt to Gemini', { indicator: eventForAnalysis.indicator, isPast: isPastEvent, promptStart: prompt.substring(0, 200) + '...'});
        const result = await googleGenaiService.model.generateContent(prompt);
        const response = result.response;
        const interpretation = response.text().trim();

        logger.info('Successfully generated contextual interpretation for event', { indicator: eventForAnalysis.indicator });

        res.json({ 
            interpretation,
            eventId: eventForAnalysis.id // Assuming the event object (fresh or original) has an id
        });

    } catch (error) { 
        logger.error(`Error interpreting calendar event: ${eventForAnalysis?.indicator || originalEventFromRequest?.indicator}`, { 
            message: error.message,
            status: error.response?.status,
            details: error.response?.data?.error?.message || error.response?.data || error.details,
            stack: error.stack 
        });
        res.status(500).json({ 
            error: 'Failed to interpret calendar event',
            message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : error.message 
        });
    }
});

// GET /api/calendar/earnings
router.get('/earnings', async (req, res) => {
    logger.info('GET /api/calendar/earnings (FMP) handler reached');

    if (!earningsCalendarService) {
        logger.error('Earnings calendar service (FMP) is not available.');
        return res.status(503).json({ error: 'Earnings calendar service unavailable' });
    }
    // Remove check for Google Genai service - no longer needed here

    // --- Parameter Validation --- 
    const { from, to } = req.query; 
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!from || !dateRegex.test(from)) {
        return res.status(400).json({ error: 'Invalid or missing "from" date parameter. Use YYYY-MM-DD format.' });
    }
    if (!to || !dateRegex.test(to)) {
        return res.status(400).json({ error: 'Invalid or missing "to" date parameter. Use YYYY-MM-DD format.' });
    }
    // --- End Parameter Validation ---

    try {
        // Step 1: Fetch calendar range (ONLY)
        const calendarEvents = await earningsCalendarService.fetchEarnings(from, to); 
        logger.debug('FMP Earnings Calendar data fetched', { count: calendarEvents.length });

        // Step 2: Return calendar data directly
        res.json({ 
            earningsCalendar: calendarEvents, // Send the raw calendar events
            message: `Fetched FMP earnings from ${from} to ${to}`,
            timestamp: new Date().toISOString()
        });

    } catch (error) { 
        // ---> ADD LOGGING HERE <---
        logger.error(`Error in GET /api/calendar/earnings route BEFORE sending response:`, { 
            errorMessage: error.message, 
            errorStack: error.stack,
            requestQuery: req.query 
        });
        logger.error(`Error in FMP earnings calendar route processing:`, { message: error.message, stack: error.stack });
        res.status(500).json({ 
            error: 'Failed to process earnings calendar data',
            message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : error.message 
        });
    }
});

// --- NEW Route for On-Demand Earnings Analysis ---
router.post('/earnings/analyze', async (req, res) => {
    // Extract symbol, event, AND overallContext from body
    const { symbol, event, overallContext } = req.body; 
    logger.info(`POST /api/calendar/earnings/analyze received for symbol: ${symbol}`);

    // --- Validation ---
    if (!symbol) {
        return res.status(400).json({ error: 'Missing symbol in request body.' });
    }
    if (!event || typeof event !== 'object' || typeof event.epsEstimated === 'undefined') {
        return res.status(400).json({ error: 'Missing or invalid event data in request body.' });
    }
    // Add validation/default for overallContext? Optional, service can handle default.
    const contextToUse = overallContext || "Overall market context was not provided.";
    
    if (!earningsCalendarService) {
        logger.error('Earnings calendar service (FMP) is not available for history fetch.');
        return res.status(503).json({ error: 'Data service unavailable' });
    }
    if (!googleGenaiService) {
         logger.error('Google Genai service is not available for analysis.');
        return res.status(503).json({ error: 'Analysis service unavailable' });
    }
    // --- End Validation ---

    try {
        // Step 1: Fetch BOTH historical data and trend data in parallel
        const [historicalData, trendData] = await Promise.all([
            earningsCalendarService.fetchHistoricalEarnings(symbol),
            earningsCalendarService.fetchEarningsTrendData(symbol)
        ]);
        
        logger.debug(`Fetched historical data for ${symbol}`, { count: historicalData?.length ?? 0 });
        logger.debug(`Fetched trend data for ${symbol}`, { count: trendData?.length ?? 0 });

        // Step 2: Run LLM Analysis 
        if (typeof event.epsEstimated !== 'number') { 
            logger.info(`Skipping LLM analysis for ${symbol} - no estimate provided.`);
             return res.json({ 
                symbol: symbol,
                analysis: 'N/A (No Estimate)' 
            });
        }
        
        // Pass overall context to the analysis function
        const analysisText = await googleGenaiService.analyzeEarningsTrend(
            symbol, 
            event, 
            historicalData, 
            trendData, 
            contextToUse // Pass the context
        );
        logger.info(`LLM analysis completed for ${symbol}`);

        // Step 3: Return analysis
        res.json({ 
            symbol: symbol, 
            analysis: analysisText 
        });

    } catch (error) { 
        logger.error(`Error processing on-demand earnings analysis for ${symbol}:`, { 
            message: error.message, 
            stack: error.stack 
        });
        res.status(500).json({ 
            error: `Failed to analyze earnings trend for ${symbol}`,
            message: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : error.message 
        });
    }
});

// --- DEBUG ENDPOINT to test fresh data fetching ---
router.post('/debug-fresh-fetch', async (req, res) => {
    logger.info('POST /api/calendar/debug-fresh-fetch handler reached');

    if (!calendarService) {
        return res.status(503).json({ error: 'Calendar service unavailable' });
    }

    const { event } = req.body;
    if (!event || !event.indicator || !event.country) {
        return res.status(400).json({ error: 'Invalid event data' });
    }

    try {
        logger.info('DEBUG: Original event data', { event });
        
        const freshEvent = await calendarService.fetchSingleEventDetails(event);
        
        logger.info('DEBUG: Fresh event data', { freshEvent });
        
        res.json({
            success: true,
            original: event,
            fresh: freshEvent,
            changed: JSON.stringify(event) !== JSON.stringify(freshEvent),
            actualChanged: event.actual !== freshEvent.actual
        });
        
    } catch (error) {
        logger.error('DEBUG: Error in debug-fresh-fetch', { error: error.message });
        res.status(500).json({ error: error.message });
    }
});

export default router; 