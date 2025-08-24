import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });
console.log('Environment variables loaded:');
console.log('VITE_SUPABASE_URL:', !!process.env.VITE_SUPABASE_URL);
console.log('DIFFBOT_TOKEN:', !!process.env.DIFFBOT_TOKEN);
console.log('COHERE_API_KEY:', !!process.env.COHERE_API_KEY);
console.log('GEMINI_API_KEY:', !!process.env.GEMINI_API_KEY);
console.log('REDIS_URL:', !!process.env.REDIS_URL);
