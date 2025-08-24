const axios = require('axios');

async function simulateChangeDetection() {
  // Valid payload
  const validPayload = {
    url: "https://tradingeconomics.com/united-states/news",
    timestamp: new Date().toISOString(),
    selector: ".news-article",
    content: {
      title: "Fed Signals Potential Rate Cuts in 2024",
      text: `The Federal Reserve kept interest rates steady at 5.25-5.50% in December 2023.

      Economic data showed inflation cooling to 3.1% in November, while unemployment remained at 3.7%.
      
      Fed Chair Powell indicated that the committee expects three rate cuts in 2024, citing progress in controlling inflation.`,
      published_date: new Date().toISOString()
    }
  };

  // Invalid payload (for testing validation)
  const invalidPayload = {
    url: "https://invalid-url.com",
    timestamp: "invalid-date",
    content: {
      text: "Too short"
    }
  };

  try {
    console.log('🧪 Testing valid payload...');
    const validResponse = await axios.post('http://localhost:3000/webhook', validPayload);
    console.log('\n✅ Valid payload response:', JSON.stringify(validResponse.data, null, 2));

    console.log('\n🧪 Testing invalid payload...');
    await axios.post('http://localhost:3000/webhook', invalidPayload);
  } catch (error) {
    if (error.response) {
      console.log('\n❌ Invalid payload response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('\n❌ Error:', error.message);
    }
  }
}

simulateChangeDetection();
