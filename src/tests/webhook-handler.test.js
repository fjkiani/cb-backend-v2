describe('Enhanced Webhook Handler Tests', () => {
  let handler;

  beforeEach(() => {
    handler = new EnhancedWebhookHandler();
  });

  test('validates payload against configuration', async () => {
    const payload = {
      url: "https://tradingeconomics.com/united-states/news",
      timestamp: new Date().toISOString(),
      diff: "<div>Changed content</div>",
      selector: ".news-article",
      content: {
        title: "Test Article",
        text: "A".repeat(200), // Meet minimum length
        published_date: new Date().toISOString()
      }
    };

    const isValid = await handler.validateChange(payload);
    expect(isValid).toBe(true);
  });

  test('rejects changes below threshold', async () => {
    const smallPayload = {
      content: {
        text: "Small change",
        title: "Test"
      }
    };

    await expect(handler.validateChange(smallPayload))
      .rejects
      .toThrow('Change does not meet minimum threshold');
  });
}); 