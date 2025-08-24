import { NewsScraper } from './pythonScraper.js';

const test = async () => {
    console.log('Starting test...');
    const scraper = new NewsScraper();
    await scraper.checkForNewNews();
    console.log('Test completed');
}

test().catch(console.error);
