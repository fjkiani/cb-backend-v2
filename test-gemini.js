import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testGemini() {
  console.log('=== TESTING GEMINI API ===');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ No GEMINI_API_KEY found in environment variables');
    return;
  }

  console.log('✅ API key found');

  try {
    // Initialize Google AI
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
      generationConfig: {
        temperature: 0.4,
        topK: 1,
        topP: 1,
        maxOutputTokens: 2048,
      },
    });

    console.log('✅ Google AI SDK initialized');

    // Test prompt
    const prompt = `You are a financial news analyst. Create a concise market overview based on this article:

Article: "Market Update: Positive Momentum. The stock market showed positive momentum today with major indices gaining ground. Technology stocks led the advance, while energy sector also performed well. Market analysts are optimistic about the coming weeks."

Generate a 2-3 sentence market overview:`;

    console.log('🔄 Sending request to Gemini...');

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    console.log('✅ Gemini response received:');
    console.log('---');
    console.log(text);
    console.log('---');

  } catch (error) {
    console.error('❌ Gemini test failed:', error.message);
    if (error.response) {
      console.error('Error details:', error.response.data);
    }
  }
}

// Run the test
testGemini().catch(console.error);
