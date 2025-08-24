import express from 'express';
import logger from '../logger.js';
// Lazy import storage and redis inside handlers to avoid cold-start issues

const router = express.Router();
let storage;
let redis;

function isWithinMarketHoursEastern() {
	// Compute current time in America/New_York without external deps
	const nowStr = new Date().toLocaleString('en-US', {
		timeZone: 'America/New_York',
		hour12: false,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		weekday: 'short'
	});
	// Example: "Mon, 04/21/2025, 15:42"
	// But format across Node versions can vary; split conservatively
	const parts = nowStr.replace(',', '').split(' ');
	// Expect parts like ["Mon", "MM/DD/YYYY", "HH:MM"]
	const weekday = parts[0];
	const time = parts[2] || '';
	const [hourStr, minuteStr] = time.split(':');
	const hour = parseInt(hourStr || '0', 10);
	const minute = parseInt(minuteStr || '0', 10);
	const dowIsWeekend = weekday === 'Sat' || weekday === 'Sun';
	if (dowIsWeekend) return false;
	const minutes = hour * 60 + minute;
	const open = 9 * 60 + 30;  // 09:30
	const close = 16 * 60;     // 16:00
	return minutes >= open && minutes <= close;
}

async function acquireLock(key, ttlSeconds) {
	try {
		if (!redis) {
			const { getRedisClient } = await import('../services/redis/redisClient.js');
			redis = getRedisClient();
		}
		const result = await redis.set(key, '1', 'NX', 'EX', ttlSeconds);
		return result === 'OK';
	} catch (error) {
		logger.error('Failed to acquire Redis lock', { error: error.message });
		return false;
	}
}

async function releaseLock(key) {
	try {
		if (!redis) {
			const { getRedisClient } = await import('../services/redis/redisClient.js');
			redis = getRedisClient();
		}
		await redis.del(key);
	} catch (error) {
		logger.error('Failed to release Redis lock', { error: error.message });
	}
}

router.post('/run-minute-scrape', async (req, res) => {
	try {
		// Simple bearer token auth
		const authHeader = req.headers.authorization || '';
		const expected = process.env.CRON_TOKEN ? `Bearer ${process.env.CRON_TOKEN}` : null;
		if (!expected || authHeader !== expected) {
			return res.status(401).json({ ok: false, error: 'unauthorized' });
		}

		// Check if we're in market hours
		const isMarketHours = isWithinMarketHoursEastern();
		
		// Get frequency from query param (default to market hours logic)
		const frequency = req.query.frequency || (isMarketHours ? 'high' : 'low');
		
		// Set lock TTL based on frequency
		// high = 30s intervals, need 25s lock
		// low = 1h intervals, need 55min lock
		const lockTtl = frequency === 'high' ? 25 : 3300; // 55 minutes
		const lockKey = `te:scrape:lock:${frequency}`;

		// Prevent overlapping runs
		const gotLock = await acquireLock(lockKey, lockTtl);
		if (!gotLock) {
			return res.json({ ok: true, skipped: 'locked', frequency });
		}

		logger.info('Scrape triggered', { frequency, isMarketHours });
		
		const forceFresh = isMarketHours;
 		const { scrapeNews } = await import('../scraper.js');
		const articles = await scrapeNews(forceFresh);

		if (Array.isArray(articles) && articles.length > 0) {
			if (!storage) {
				const { SupabaseStorage } = await import('../services/storage/supabase/supabaseStorage.js');
				storage = new SupabaseStorage();
			}
			await storage.storeArticles(articles);
			logger.info('Stored articles from scheduled scrape', {
				count: articles.length,
				firstTitle: articles[0]?.title,
				frequency,
				isMarketHours
			});
		}

		await releaseLock(lockKey);
		return res.json({ 
			ok: true, 
			stored: articles?.length || 0, 
			frequency,
			isMarketHours,
			forceFresh
		});
	} catch (error) {
		logger.error('run-minute-scrape error', { error: error.message });
		return res.status(500).json({ ok: false, error: error.message });
	}
});

router.post('/trigger-te-scrape', async (req, res) => {
	try {
		// Simple bearer token auth
		const authHeader = req.headers.authorization || '';
		const expected = process.env.CRON_TOKEN ? `Bearer ${process.env.CRON_TOKEN}` : null;
		if (!expected || authHeader !== expected) {
			return res.status(401).json({ ok: false, error: 'unauthorized' });
		}

		// Respond immediately
		res.json({ ok: true, message: 'Trading Economics scraper triggered', timestamp: new Date().toISOString() });

		// Run scraper in background (don't await)
		setImmediate(async () => {
			try {
				logger.info('Background Trading Economics scrape triggered');
				const { scrapeNews } = await import('../scraper.js');
				const articles = await scrapeNews(true); // force fresh
				
				if (Array.isArray(articles) && articles.length > 0) {
					if (!storage) {
						const { SupabaseStorage } = await import('../services/storage/supabase/supabaseStorage.js');
						storage = new SupabaseStorage();
					}
					await storage.storeArticles(articles);
					logger.info('Background scrape completed', {
						count: articles.length,
						firstTitle: articles[0]?.title
					});
				} else {
					logger.info('Background scrape returned no articles');
				}
			} catch (error) {
				logger.error('Background scrape error', { error: error.message });
			}
		});
		
	} catch (error) {
		logger.error('trigger-te-scrape error', { error: error.message });
		return res.status(500).json({ ok: false, error: error.message });
	}
});

export default router; 