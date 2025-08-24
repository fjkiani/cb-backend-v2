const { validateWebhookPayload } = require('../middleware/webhook-validator');
const logger = require('../utils/logger');

class WebhookHandler {
  constructor() {
    this.eventQueue = [];
  }

  async processWebhook(payload) {
    try {
      // Validate incoming payload
      validateWebhookPayload(payload);
      
      // Log the incoming webhook
      logger.info('Received webhook payload', { 
        timestamp: payload.timestamp,
        url: payload.url 
      });

      // Add to processing queue
      this.eventQueue.push({
        timestamp: new Date(),
        payload,
        status: 'pending'
      });

      // Return immediate acknowledgment
      return {
        status: 'accepted',
        queuePosition: this.eventQueue.length,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Webhook processing error', { error: error.message });
      throw error;
    }
  }

  // Method to check queue status
  getQueueStatus() {
    return {
      queueLength: this.eventQueue.length,
      pendingItems: this.eventQueue.filter(item => item.status === 'pending').length
    };
  }
}

module.exports = { WebhookHandler }; 