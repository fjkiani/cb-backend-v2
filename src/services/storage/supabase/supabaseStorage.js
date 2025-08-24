// src/services/storage/supabase/supabaseStorage.js
import { createClient } from '@supabase/supabase-js';
import logger from '../../../logger.js';

class SupabaseStorage {
  constructor() {
    // Try all possible environment variable combinations
    const supabaseUrl = 
      process.env.VITE_SUPABASE_URL || 
      process.env.SUPABASE_URL || 
      process.env.DB_URL;

    const supabaseKey = 
      process.env.VITE_SUPABASE_KEY || 
      process.env.SUPABASE_KEY || 
      process.env.SERVICE_KEY;

    // Debug environment variables
    logger.info('Supabase environment check:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseKey,
      urlStart: supabaseUrl?.substring(0, 20) + '...',
      envKeys: Object.keys(process.env).filter(key => 
        key.includes('SUPABASE') || 
        key.includes('DB_') || 
        key.includes('SERVICE_') ||
        key.includes('VITE_')
      )
    });

    if (!supabaseUrl || !supabaseKey) {
      const error = new Error('Missing Supabase credentials');
      error.details = {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseKey,
        envKeys: Object.keys(process.env)
      };
      throw error;
    }

    try {
      this.supabase = createClient(supabaseUrl, supabaseKey);
      logger.info('SupabaseStorage initialized successfully');
    } catch (error) {
      logger.error('Failed to create Supabase client:', error);
      throw error;
    }
  }

  ensureDate(dateInput) {
    if (dateInput instanceof Date) {
      return dateInput;
    }
    return new Date(dateInput);
  }

  generateUniqueKey(article) {
    // Create a composite key using URL, title, and date
    // Normalize and clean the inputs to ensure consistency
    const cleanTitle = (article.title || '').trim().toLowerCase();
    const cleanUrl = (article.url || '').trim().toLowerCase();
    const publishedAt = this.ensureDate(article.publishedAt || article.date).toISOString();
    
    return `${cleanUrl}_${cleanTitle}_${publishedAt}`;
  }

  async storeArticle(article) {
    try {
      const articleDate = article.publishedAt || article.date;
      
      const articleData = {
        title: article.title,
        content: article.content,
        url: article.url,
        published_at: this.ensureDate(articleDate),
        source: article.source || 'Trading Economics',
        category: article.category || 'Market News',
        sentiment_score: article.sentiment?.score || 0,
        sentiment_label: article.sentiment?.label || 'neutral',
        raw_data: article,
        unique_key: this.generateUniqueKey(article),
        created_at: new Date().toISOString()
      };

      // First check if article exists using unique_key instead of just URL
      const { data: existing } = await this.supabase
        .from('articles')
        .select('id, title, published_at, unique_key')
        .eq('unique_key', articleData.unique_key)
        .single();

      if (existing) {
        // Update existing article
        const { data, error } = await this.supabase
          .from('articles')
          .update(articleData)
          .eq('unique_key', articleData.unique_key)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Insert new article
        const { data, error } = await this.supabase
          .from('articles')
          .insert([articleData])  // Note the array wrapper
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    } catch (error) {
      logger.error('Failed to store article:', {
        error,
        article: {
          title: article.title,
          url: article.url
        }
      });
      throw error;
    }
  }

  async storeArticles(articles) {
    try {
      const uniqueArticles = Array.from(
        new Map(articles.map(article => [
          this.generateUniqueKey(article),
          article
        ])).values()
      );

      const articlesData = uniqueArticles.map(article => {
        const articleDate = article.publishedAt || article.date;
        return {
          title: article.title,
          content: article.content,
          url: article.url,
          published_at: this.ensureDate(articleDate),
          source: article.source || 'Trading Economics',
          category: article.category || 'Market News',
          sentiment_score: article.sentiment?.score || 0,
          sentiment_label: article.sentiment?.label || 'neutral',
          raw_data: article,
          unique_key: this.generateUniqueKey(article),
          created_at: new Date().toISOString()
        };
      });

      const { data, error } = await this.supabase
        .from('articles')
        .upsert(articlesData, {
          onConflict: 'unique_key',
          ignoreDuplicates: true
        })
        .select();

      if (error) throw error;
      return data || [];
    } catch (error) {
      logger.error('Failed to store articles:', error);
      throw error;
    }
  }

  async getRecentArticles(limit = 100) {
    try {
      // First get total count
      const { count, error: countError } = await this.supabase
        .from('articles')
        .select('*', { count: 'exact', head: true });

      if (countError) throw countError;

      logger.info('Found total articles in Supabase:', { count });

      // Then get articles
      const { data, error } = await this.supabase
        .from('articles')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      
      // Log raw data from Supabase
      logger.info('Raw Supabase response:', {
        allUrls: data?.map(a => a.url),
        first: data?.[0]?.title,
        last: data?.[data.length - 1]?.title,
        returnedCount: data?.length,
        totalCount: count
      });
      
      // Transform data for frontend
      const transformedData = data?.map(article => ({
        ...article,
        publishedAt: article.published_at,
        created_at: article.created_at || article.published_at // Fallback to published_at if created_at is null
      })) || [];
      
      // Log transformed data
      logger.info('Transformed articles:', {
        count: transformedData.length,
        first: transformedData[0]?.title,
        last: transformedData[transformedData.length - 1]?.title
      });
      
      return {
        articles: transformedData,
        totalCount: count
      };
    } catch (error) {
      logger.error('Failed to get recent articles:', error);
      throw error;
    }
  }
}

export { SupabaseStorage };
export default SupabaseStorage;