import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

console.log('Starting function...')
console.log('Environment variables:', {
  dbUrl: Deno.env.get('DB_URL'),
  serviceKey: Deno.env.get('SERVICE_KEY')?.substring(0, 10) + '...',
  diffbotToken: Deno.env.get('DIFFBOT_TOKEN')?.substring(0, 10) + '...'
})

const supabaseUrl = Deno.env.get('DB_URL')!
const supabaseKey = Deno.env.get('SERVICE_KEY')!
const diffbotToken = Deno.env.get('DIFFBOT_TOKEN')!

interface DiffbotArticle {
  date: string;
  sentiment: number;
  author: string;
  text: string;
  title: string;
  url: string;
}

interface PythonScraperResult {
  success: boolean;
  articles?: DiffbotArticle[];
  metadata?: {
    timestamp: string;
    source_url: string;
    title: string;
  };
  error?: string;
}

serve(async (req) => {
  try {
    console.log('Processing scraper results...')
    
    // Get data from Python scraper
    const scraperResult: PythonScraperResult = await req.json()
    
    if (!scraperResult.success) {
      throw new Error(scraperResult.error || 'Scraper failed')
    }

    const supabase = createClient(
      Deno.env.get('DB_URL')!,
      Deno.env.get('SERVICE_KEY')!
    )

    if (scraperResult.articles && scraperResult.articles.length > 0) {
      // Transform articles to match your Supabase schema
      const articlesToStore = scraperResult.articles.map(article => ({
        title: article.title,
        content: article.text,
        url: article.url,
        published_at: article.date,
        publishedAt: article.date,
        source: 'Trading Economics',
        sentiment_score: article.sentiment || 0,
        sentiment_label: article.sentiment >= 0.1 ? 'positive' : article.sentiment <= -0.1 ? 'negative' : 'neutral',
        raw_data: article
      }))

      const { error } = await supabase
        .from('articles')
        .upsert(articlesToStore, {
          onConflict: 'url',
          ignoreDuplicates: false
        })

      if (error) throw error
      console.log(`Stored ${articlesToStore.length} articles`)

      return new Response(
        JSON.stringify({
          success: true,
          newArticles: articlesToStore.length,
          message: `Stored ${articlesToStore.length} new articles`
        }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        newArticles: 0,
        message: 'No new articles to store'
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { 
        headers: { 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})