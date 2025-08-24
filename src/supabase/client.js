import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Debug log before accessing variables
console.log('Environment Check:', {
  allEnvKeys: Object.keys(process.env),
  supabaseVars: {
    url: process.env.VITE_SUPABASE_URL,
    key: process.env.VITE_SUPABASE_ANON_KEY,
  },
  dirname: __dirname,
  envPath: path.resolve(__dirname, '../../../.env')
});

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Supabase Config:', {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseKey,
    urlStart: supabaseUrl?.substring(0, 20) + '...',
    keyStart: supabaseKey?.substring(0, 20) + '...',
    envKeys: Object.keys(process.env)
  });
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true
  },
  db: {
    schema: 'public'
  }
});
