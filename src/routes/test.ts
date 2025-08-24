import express from 'express';
import { scrapeNews } from '../scraper';

const router = express.Router();

router.get('/test-cache', async (req, res) => {
  try {
    // First call - should hit Diffbot
    console.time('First call (API)');
    const firstCall = await scrapeNews();
    console.timeEnd('First call (API)');
    
    // Second call - should hit cache
    console.time('Second call (Cache)');
    const secondCall = await scrapeNews();
    console.timeEnd('Second call (Cache)');
    
    // Force fresh call - should hit Diffbot
    console.time('Force fresh call (API)');
    const forceFresh = await scrapeNews(true);
    console.timeEnd('Force fresh call (API)');

    res.json({
      firstCallArticles: firstCall.length,
      secondCallArticles: secondCall.length,
      forceFreshArticles: forceFresh.length,
      sample: firstCall[0] // Show first article as sample
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router; 