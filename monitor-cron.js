#!/usr/bin/env node

/**
 * Cron Job Monitor
 * 
 * This script monitors the cron job activity by:
 * 1. Checking the cron status endpoint every 30 seconds
 * 2. Showing when the last run was and how many articles were found
 * 3. Tracking if the cron job is running on schedule
 */

const https = require('https');

const BACKEND_URL = 'https://web-production-1c60b.up.railway.app';
const CHECK_INTERVAL = 30000; // 30 seconds

let lastRunCount = 0;
let lastRunTime = null;

function checkCronStatus() {
  const url = `${BACKEND_URL}/api/cron/status`;
  
  https.get(url, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const response = JSON.parse(data);
        const now = new Date().toISOString();
        
        if (response.status === 'ok' && response.cronJob) {
          const cron = response.cronJob;
          
          console.log(`\n[${now}] Cron Job Status:`);
          console.log(`  Run Count: ${cron.runCount}`);
          console.log(`  Last Run: ${cron.lastRun || 'Never'}`);
          console.log(`  Next Run: ${cron.nextRun || 'Unknown'}`);
          console.log(`  Currently Running: ${cron.isRunning ? 'YES' : 'NO'}`);
          console.log(`  Last Articles Found: ${cron.lastArticlesCount}`);
          console.log(`  Last Error: ${cron.lastError || 'None'}`);
          
          // Check if we have a new run
          if (cron.runCount > lastRunCount) {
            console.log(`\n🎉 NEW CRON RUN DETECTED!`);
            console.log(`  Articles found: ${cron.lastArticlesCount}`);
            console.log(`  Run time: ${cron.lastRun}`);
            lastRunCount = cron.runCount;
            lastRunTime = cron.lastRun;
          }
          
          // Check if we're overdue for a run
          if (cron.nextRun) {
            const nextRunTime = new Date(cron.nextRun);
            const nowTime = new Date();
            const timeUntilNext = nextRunTime - nowTime;
            
            if (timeUntilNext < 0) {
              console.log(`\n⚠️  CRON JOB OVERDUE! Should have run ${Math.abs(Math.floor(timeUntilNext / 1000))} seconds ago`);
            } else {
              console.log(`  Time until next run: ${Math.floor(timeUntilNext / 1000)} seconds`);
            }
          }
          
        } else {
          console.log(`\n[${now}] Error getting cron status:`, response.message || 'Unknown error');
        }
        
      } catch (error) {
        console.log(`\n[${new Date().toISOString()}] Error parsing response:`, error.message);
      }
    });
    
  }).on('error', (error) => {
    console.log(`\n[${new Date().toISOString()}] Error checking cron status:`, error.message);
  });
}

function startMonitoring() {
  console.log('🔍 Starting Cron Job Monitor...');
  console.log(`Backend URL: ${BACKEND_URL}`);
  console.log(`Check interval: ${CHECK_INTERVAL / 1000} seconds`);
  console.log('Press Ctrl+C to stop\n');
  
  // Initial check
  checkCronStatus();
  
  // Set up interval
  setInterval(checkCronStatus, CHECK_INTERVAL);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n👋 Stopping cron job monitor...');
  process.exit(0);
});

// Start monitoring
startMonitoring();
