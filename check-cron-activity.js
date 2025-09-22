#!/usr/bin/env node

/**
 * Simple Cron Activity Checker
 * 
 * This script checks if the cron job is working by:
 * 1. Fetching the latest articles from the API
 * 2. Checking their creation timestamps
 * 3. Determining if new articles are being added regularly
 */

import https from 'https';

const BACKEND_URL = 'https://web-production-1c60b.up.railway.app';

function fetchLatestArticles() {
  return new Promise((resolve, reject) => {
    const url = `${BACKEND_URL}/api/news?limit=10`;
    
    https.get(url, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const articles = JSON.parse(data);
          resolve(articles);
        } catch (error) {
          reject(error);
        }
      });
      
    }).on('error', (error) => {
      reject(error);
    });
  });
}

function analyzeCronActivity(articles) {
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
  
  console.log(`\n📊 CRON JOB ACTIVITY ANALYSIS`);
  console.log(`Current time: ${now.toISOString()}`);
  console.log(`Total articles fetched: ${articles.length}`);
  
  if (articles.length === 0) {
    console.log('❌ No articles found - cron job may not be working');
    return;
  }
  
  // Analyze creation times
  const recentArticles = articles.filter(article => {
    const createdAt = new Date(article.created_at);
    return createdAt > oneHourAgo;
  });
  
  const veryRecentArticles = articles.filter(article => {
    const createdAt = new Date(article.created_at);
    return createdAt > fiveMinutesAgo;
  });
  
  console.log(`\n📈 TIMELINE ANALYSIS:`);
  console.log(`  Articles created in last hour: ${recentArticles.length}`);
  console.log(`  Articles created in last 5 minutes: ${veryRecentArticles.length}`);
  
  // Show latest articles with timestamps
  console.log(`\n🕒 LATEST ARTICLES:`);
  articles.slice(0, 5).forEach((article, index) => {
    const createdAt = new Date(article.created_at);
    const timeAgo = Math.floor((now - createdAt) / 1000);
    console.log(`  ${index + 1}. "${article.title}"`);
    console.log(`     Created: ${createdAt.toISOString()} (${timeAgo}s ago)`);
  });
  
  // Determine cron job status
  console.log(`\n🔍 CRON JOB STATUS:`);
  
  if (veryRecentArticles.length > 0) {
    console.log(`  ✅ CRON JOB IS ACTIVE - Found ${veryRecentArticles.length} articles in last 5 minutes`);
  } else if (recentArticles.length > 0) {
    console.log(`  ⚠️  CRON JOB MAY BE RUNNING - Found ${recentArticles.length} articles in last hour`);
    console.log(`     (Check if it's running every 5 minutes as expected)`);
  } else {
    console.log(`  ❌ CRON JOB APPEARS INACTIVE - No articles in last hour`);
  }
  
  // Check for patterns
  const creationTimes = articles.map(a => new Date(a.created_at)).sort((a, b) => b - a);
  if (creationTimes.length >= 2) {
    const timeDiff = (creationTimes[0] - creationTimes[1]) / 1000 / 60; // minutes
    console.log(`\n⏱️  TIME BETWEEN LATEST ARTICLES: ${timeDiff.toFixed(1)} minutes`);
    
    if (timeDiff <= 10) {
      console.log(`  ✅ Good - Articles are being created frequently`);
    } else if (timeDiff <= 30) {
      console.log(`  ⚠️  Moderate - Articles created every ${timeDiff.toFixed(1)} minutes`);
    } else {
      console.log(`  ❌ Slow - Articles created every ${timeDiff.toFixed(1)} minutes (expected every 5 minutes)`);
    }
  }
}

async function checkCronActivity() {
  try {
    console.log('🔍 Checking cron job activity...');
    const articles = await fetchLatestArticles();
    analyzeCronActivity(articles);
  } catch (error) {
    console.error('❌ Error checking cron activity:', error.message);
  }
}

// Run the check
checkCronActivity();
