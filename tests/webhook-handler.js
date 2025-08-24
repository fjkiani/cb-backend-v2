const express = require('express');
const bodyParser = require('body-parser');
const WebhookValidator = require('./utils/validator');

const app = express();
app.use(bodyParser.json());

app.post('/webhook', (req, res) => {
  try {
    console.log('\n📥 Received webhook:', JSON.stringify(req.body, null, 2));
    
    const validation = WebhookValidator.validatePayload(req.body);
    
    if (!validation.isValid) {
      console.log('❌ Validation failed:', validation.errors);
      return res.status(400).json({
        success: false,
        errors: validation.errors,
        timestamp: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      message: 'Webhook received successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {  // Listen on all interfaces
  console.log(`🚀 Webhook handler running on port ${PORT}`);
});
