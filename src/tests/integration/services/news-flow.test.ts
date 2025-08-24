import { NewsCoordinatorService } from '../../../services/NewsCoordinatorService';
import { CacheService } from '../../../services/cache/CacheService';
import { DiffbotService } from '../../../services/diffbot/DiffbotService';
import { ChangeDetectionService } from '../../../services/monitoring/ChangeDetectionService';
import { DiffbotResponse } from '../../../services/diffbot/types';
import { ILogger } from '../../../types/logger';

jest.mock('../../../services/cache/CacheService');
jest.mock('../../../services/diffbot/DiffbotService');
jest.mock('../../../services/monitoring/ChangeDetectionService');

describe('News Flow Integration', () => {
  let newsCoordinator: NewsCoordinatorService;
  let mockLogger: ILogger;
  let mockCache: jest.Mocked<CacheService>;
  let mockDiffbot: jest.Mocked<DiffbotService>;
  let mockChangeDetection: jest.Mocked<ChangeDetectionService>;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    };

    mockCache = new CacheService({ redisUrl: 'redis://localhost:6379' }, mockLogger) as jest.Mocked<CacheService>;
    mockDiffbot = new DiffbotService({ apiToken: 'test-token' }, mockLogger) as jest.Mocked<DiffbotService>;
    mockChangeDetection = new ChangeDetectionService(mockLogger) as jest.Mocked<ChangeDetectionService>;

    newsCoordinator = new NewsCoordinatorService(
      mockChangeDetection,
      mockDiffbot,
      mockCache,
      mockLogger
    );
  });

  it('should process news flow end-to-end', async () => {
    // Mock with proper DiffbotResponse type
    const mockDiffbotResponse: DiffbotResponse = {
      objects: [{ type: 'article', title: 'Test' }],
      url: 'https://test.com'
    };

    mockChangeDetection.checkForChanges.mockResolvedValue({ hasChanged: true, currentUrl: 'https://test.com' });
    mockDiffbot.analyze.mockResolvedValue(mockDiffbotResponse);
    mockCache.set.mockResolvedValue();

    const result = await newsCoordinator.processNews();
    expect(result).toBeDefined();
  }, 10000);
}); 