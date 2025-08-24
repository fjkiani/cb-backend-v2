import express from 'express';
import { scrapeNews } from '../scraper.js';
import logger from '../logger.js';
import { DiffbotService } from '../services/diffbot/DiffbotService.js';
import { SupabaseStorage } from '../services/storage/supabase/supabaseStorage.js';
import axios from 'axios';
import * as cheerio from 'cheerio';

const router = express.Router();

router.get('/news', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    
    // First, send an immediate response
    res.json({
      message: 'Scraping initiated. Please check back in a few minutes.',
      status: 'processing',
      timestamp: new Date().toISOString()
    });

    // Then continue processing in the background
    if (forceRefresh) {
      scrapeNews(true)
        .then(async (articles) => {
          logger.info('Background scraping completed:', {
            count: articles.length,
            timestamp: new Date().toISOString()
          });

          // Store the timestamp of successful scraping using SupabaseStorage client
          try {
            const storage = new SupabaseStorage();
            await storage.supabase
            .from('system_status')
              .upsert([{ key: 'last_scrape', value: new Date().toISOString(), updated_at: new Date().toISOString() }]);
          } catch (e) {
            logger.warn('Failed to upsert system_status last_scrape', { error: e.message });
          }
        })
        .catch(error => {
          logger.error('Background scraping failed:', {
            error: error.message,
            timestamp: new Date().toISOString()
          });
        });
    }
  } catch (error) {
    logger.error('Error in /news endpoint:', error);
    res.status(500).json({ 
      error: 'Failed to initiate scraping',
      message: error.message 
    });
  }
});

async function fetchTopTeNewsLinks(limit = 5) {
  const startUrl = 'https://tradingeconomics.com/united-states/news';
  try {
    const resp = await axios.get(startUrl, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)' } });
    const $ = cheerio.load(resp.data);
    const found = new Set();
    const links = [];

    $('a').each((_, el) => {
      const href = $(el).attr('href');
      if (!href) return;
      let abs = href;
      if (abs.startsWith('/')) abs = `https://tradingeconomics.com${abs}`;
      if (!abs.startsWith('http')) return;
      if (!abs.includes('tradingeconomics.com')) return;
      // prefer United States articles or stock market pieces
      const ok = abs.includes('/united-states/') || abs.includes('/stock-market') || abs.includes('/news');
      if (!ok) return;
      if (!found.has(abs)) {
        found.add(abs);
        links.push(abs);
      }
    });

    logger.info('Fetched TE news list links', { count: links.length });
    return links.slice(0, limit);
  } catch (err) {
    logger.error('Failed to fetch TE news list', { error: err.message });
    return [];
  }
}

// New: Hard refresh Diffbot on key pages and store results
router.post('/hard-refresh', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const expected = process.env.CRON_TOKEN ? `Bearer ${process.env.CRON_TOKEN}` : null;
    if (expected && authHeader !== expected) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }

    const defaultUrls = [
      'https://tradingeconomics.com/united-states/stock-market',
      'https://tradingeconomics.com/united-states/news',
      'https://tradingeconomics.com/united-states/government-bond-yield'
    ];
    const urls = (req.body && Array.isArray(req.body.urls) && req.body.urls.length > 0)
      ? req.body.urls
      : defaultUrls;

    // Respond immediately to avoid Vercel timeouts
    res.json({ ok: true, accepted: true, urls, timestamp: new Date().toISOString() });

    // Perform Diffbot analysis in background
    setImmediate(async () => {
      try {
        const diffbot = new DiffbotService({ apiToken: process.env.DIFFBOT_TOKEN }, logger);
        const storage = new SupabaseStorage();

        // Crawl TE news page for top article links
        const topNewsLinks = await fetchTopTeNewsLinks(6);
        const allTargets = Array.from(new Set([ ...urls, ...topNewsLinks ]));
        logger.info('Hard-refresh targets', { total: allTargets.length });

        const results = await Promise.allSettled(allTargets.map(url => diffbot.analyze(url)));
        const articles = [];
        const nowIso = new Date().toISOString();

        results.forEach((r, idx) => {
          if (r.status === 'fulfilled' && r.value?.objects?.length) {
            const objects = r.value.objects;
            objects.forEach(obj => {
              const title = obj.title || obj.pageTitle || `Trading Economics Update ${idx}`;
              const content = obj.text || obj.summary || obj.html || 'No content available';
              const pageUrl = obj.pageUrl || allTargets[idx];
              const date = obj.date ? new Date(obj.date).toISOString() : nowIso;

              articles.push({
                id: `te-diffbot-${Date.now()}-${articles.length}`,
                title,
                content,
                url: pageUrl,
                publishedAt: date,
                source: 'Trading Economics',
                category: 'Market News',
                sentiment: { score: 0, label: 'neutral', confidence: 0 },
                summary: obj.summary || content.slice(0, 280),
                author: 'Trading Economics',
                tags: ['Market News']
              });
            });
          } else if (r.status === 'rejected') {
            logger.error('Diffbot analyze failed', { url: allTargets[idx], error: r.reason?.message || r.reason });
          }
        });

        if (articles.length > 0) {
          await storage.storeArticles(articles);
          logger.info('Hard-refresh stored articles', { count: articles.length });
        } else {
          logger.info('Hard-refresh: no articles extracted');
        }
      } catch (err) {
        logger.error('Hard-refresh background error', { error: err.message });
      }
    });
  } catch (error) {
    logger.error('Error in /hard-refresh endpoint:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

export default router;
