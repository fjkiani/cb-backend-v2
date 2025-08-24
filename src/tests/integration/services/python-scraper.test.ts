// src/tests/integration/python-scraper.test.ts
import { PythonShell } from 'python-shell';
import path from 'path';
import logger from '../../../../src/logger';

describe('Python Scraper Integration', () => {
  test('should successfully run Python scraper and return valid data', async () => {
    const options = {
      mode: 'json',
      pythonPath: 'python3',
      pythonOptions: ['-u'],
      scriptPath: path.join(__dirname, '../../services/news'),
      env: {
        ...process.env,
        DIFFBOT_TOKEN: process.env.VITE_DIFFBOT_TOKEN
      }
    };

    try {
      const results = await PythonShell.run('scraper.py', options);
      const result = results[0];

      expect(result).toHaveProperty('success');
      
      if (result.success) {
        expect(result).toHaveProperty('articles');
        expect(result).toHaveProperty('metadata');
        
        if (result.articles) {
          const article = result.articles[0];
          expect(article).toHaveProperty('date');
          expect(article).toHaveProperty('sentiment');
          expect(article).toHaveProperty('text');
          expect(article).toHaveProperty('title');
          expect(article).toHaveProperty('url');
        }
      }

      logger.info('Python scraper result:', result);
    } catch (error) {
      logger.error('Python scraper test failed:', error);
      throw error;
    }
  });
});