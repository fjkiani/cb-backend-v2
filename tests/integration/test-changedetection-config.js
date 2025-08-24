const yaml = require('js-yaml');
const fs = require('fs');
const axios = require('axios');

async function testChangeDetectionConfig() {
  try {
    console.log('🔍 Loading configuration...');
    const config = yaml.load(fs.readFileSync('./config/changedetection-config.yaml', 'utf8'));
    
    const testPayload = {
      url: config.url,
      timestamp: new Date().toISOString(),
      selector: ".news-article",
      content: {
        title: "Fed Announces Major Policy Change",
        text: `The Federal Reserve announced today (2024-01-15) that inflation has cooled to 3.1%. Economic indicators suggest a strong economy with GDP growth at 2.5%.

Fed Chair Jerome Powell emphasized that monetary policy remains data-dependent, with core inflation running at 3.5% year-over-year. The Federal Open Market Committee expects three rate cuts in 2024, potentially bringing rates down from the current 5.25-5.50% range.

Recent economic data shows Non Farm Payrolls increased by 199,000 in November, while the unemployment rate dropped to 3.7%. Retail Sales grew by 0.3% month-over-month, indicating resilient consumer spending.`,
        published_date: new Date().toISOString()
      }
    };

    console.log('\n📦 Testing with payload:', JSON.stringify(testPayload, null, 2));
    console.log('\n🔍 Number of paragraphs:', testPayload.content.text.split('\n\n').length);
    console.log('🔢 Percentages found:', testPayload.content.text.match(/\d+\.?\d*\s*%/g));

    const response = await axios.post('http://localhost:3000/webhook', testPayload);
    console.log('\n✅ Webhook Response:', JSON.stringify(response.data, null, 2));

  } catch (error) {
    if (error.response) {
      console.error('\n❌ Error Response:', JSON.stringify(error.response.data, null, 2));
      console.error('\n🔍 Debug Info:');
      console.error('Paragraphs:', error.response.config.data.split('\n\n').length);
      console.error('Text Sample:', error.response.config.data.substring(0, 100));
    } else {
      console.error('\n❌ Error:', error.message);
    }
  }
}

testChangeDetectionConfig();