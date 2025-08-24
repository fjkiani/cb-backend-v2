export const createMockLogger = () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
});

export const mockDiffbotResponse = {
  objects: [{
    type: 'article',
    title: 'Test Article',
    text: 'Test content'
  }],
  url: 'https://test.com'
};

export const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  setex: jest.fn()
}; 