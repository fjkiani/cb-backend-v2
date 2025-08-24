const validateWebhookPayload = (payload) => {
  const required = ['type', 'url', 'timestamp', 'changes'];
  
  for (const field of required) {
    if (!payload[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  if (!payload.changes.content || !payload.changes.location) {
    throw new Error('Invalid changes object structure');
  }

  return true;
};

module.exports = { validateWebhookPayload }; 