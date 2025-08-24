import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file in backend root
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Prefer backend keys; fall back to VITE_* only if needed
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.DB_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey); 