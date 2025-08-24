const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());

// Test webhook sender
app.post('/test-webhook', async (req, res) => {
  const testPayload = {
    type: 'change_detected',
    url: 'https://tradingeconomics.com/united-states/news',
    timestamp: new Date().toISOString(),
    changes: {
      content: 'Test article content',
      location: 'div.news-article'
    }
  };

  // Send to our n8n webhook
  try {
    const response = await fetch('http://localhost:5678/webhook/trading-news', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testPayload)
    });

    const result = await response.json();
    res.json({
      status: 'success',
      sent: testPayload,
      response: result
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

app.listen(3002, () => {
  console.log('Webhook test server running on port 3002');
}); 