const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
app.use(cors());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

async function scrapeNews() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(30000);
    
    await page.goto('https://tradingeconomics.com/stream?c=united+states', {
      waitUntil: 'networkidle0'
    });

    const articles = await page.evaluate(() => {
      const items = document.querySelectorAll('.stream-item');
      return Array.from(items).map(item => {
        const rawDate = item.querySelector('.date')?.getAttribute('data-value');
        const publishedAt = rawDate ? new Date(rawDate).toISOString() : new Date().toISOString();
        
        return {
          title: item.querySelector('.title')?.textContent?.trim() || '',
          content: item.querySelector('.description')?.textContent?.trim() || '',
          url: item.querySelector('a')?.href || '',
          publishedAt,
          source: 'Trading Economics'
        };
      });
    });

    return articles;
  } catch (error) {
    console.error('Scraping error:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

app.get('/api/scrape/trading-economics', async (req, res) => {
  try {
    const articles = await scrapeNews();
    res.json(articles);
  } catch (error) {
    console.error('Scraping error:', error);
    res.status(500).json({ 
      error: 'Failed to scrape news',
      message: error.message 
    });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Scraper service running on port ${PORT}`);
});