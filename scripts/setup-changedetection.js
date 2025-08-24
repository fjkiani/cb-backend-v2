const axios = require('axios');
const yaml = require('js-yaml');
const fs = require('fs');

async function setupChangeDetection() {
  try {
    // Load config
    const config = yaml.load(fs.readFileSync('./config/changedetection-config.yaml', 'utf8'));
    
    // Setup API endpoint
    const CHANGEDETECTION_API = process.env.CHANGEDETECTION_API || 'http://localhost:5000';
    
    console.log('🔄 Setting up changedetection.io monitoring...');

    // Create watch
    const response = await axios.post(`${CHANGEDETECTION_API}/api/v1/watch`, {
      url: config.url,
      tag: config.tag,
      css_selector: config.css_selector.join(', '),
      exclude_selector: config.exclude_selector.join(', '),
      notification: config.notification
    });

    console.log('✅ Watch created successfully:', response.data);

  } catch (error) {
    console.error('❌ Error setting up changedetection.io:', error.message);
  }
}

setupChangeDetection(); 