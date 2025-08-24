import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Set default environment variables for testing
process.env.NODE_ENV = 'test';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.VITE_SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'http://localhost:54321';
process.env.VITE_SUPABASE_KEY = process.env.VITE_SUPABASE_KEY || 'dummy-key'; 