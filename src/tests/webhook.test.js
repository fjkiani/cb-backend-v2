const { WebhookHandler } = require('../handlers/webhook-handler');
const { validateWebhookPayload } = require('../middleware/webhook-validator');

describe('Webhook Handler Tests', () => {
  let handler;

  beforeEach(() => {
    handler = new WebhookHandler();
  });

  test('validates correct payload', async () => {
    const validPayload = {
      type: 'change_detected',
      url: 'https://tradingeconomics.com/united-states/news',
      timestamp: new Date().toISOString(),
      changes: {
        content: 'Test content',
        location: 'div.test'
      }
    };

    const result = await handler.processWebhook(validPayload);
    expect(result.status).toBe('accepted');
  });

  test('rejects invalid payload', async () => {
    const invalidPayload = {
      type: 'change_detected'
      // Missing required fields
    };

    await expect(handler.processWebhook(invalidPayload))
      .rejects
      .toThrow('Missing required field');
  });
}); 