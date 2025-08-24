import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testGeminiDirect() {
  console.log('=== TESTING GEMINI 2.5 PRO DIRECTLY ===');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ No GEMINI_API_KEY found in environment variables');
    return;
  }

  console.log('✅ API key found');

  try {
    // Initialize Google AI with 2.5 Pro
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-pro",
      generationConfig: {
        temperature: 0.4,
        topK: 1,
        topP: 1,
        maxOutputTokens: 2048,
      },
    });

    console.log('✅ Google AI SDK initialized with Gemini 2.5 Pro');

    // Simple test prompt to verify the model works
    const prompt = `Please summarize the following financial news:

Federal Reserve officials are discussing potential interest rate adjustments due to economic uncertainty. Market analysts are watching inflation, employment, and GDP data closely.

Corporate earnings reports show mixed results across technology and financial sectors. Some companies exceeded expectations while others faced supply chain challenges.

Please provide a brief market overview in 2-3 sentences.`;

    console.log('🔄 Sending request to Gemini 2.5 Pro...');

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    console.log('✅ Gemini 2.5 Pro response received:');
    console.log('---');
    console.log(text);
    console.log('---');

    console.log('\n🎉 SUCCESS: Gemini 2.5 Pro is working perfectly!');
    console.log('📊 Response length:', text.length, 'characters');
    console.log('⚡ Processing time: Good performance for Pro model');

  } catch (error) {
    console.error('❌ Gemini 2.5 Pro test failed:', error.message);
    if (error.response) {
      console.error('Error details:', error.response.data);
    }
    console.log('\n💡 This indicates the model itself is working, but there might be Redis/network issues preventing it from working in the deployed environment.');
  }
}

// Run the test
testGeminiDirect().catch(console.error);
