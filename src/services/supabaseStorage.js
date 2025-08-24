async storeArticle(article) {
  try {
    const { data: existingArticle } = await this.supabase
      .from('articles')
      .select('id, analysis')
      .eq('unique_key', this.generateUniqueKey(article))
      .single();

    if (existingArticle) {
      // If we already have this article and it has analysis, skip storing
      if (article.analysis && !existingArticle.analysis) {
        // Only update if we're adding analysis to an article that didn't have it
        const { data, error } = await this.supabase
          .from('articles')
          .update({ 
            analysis: article.analysis,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingArticle.id);

        if (error) throw error;
        logger.info('Updated existing article with analysis:', { 
          title: article.title,
          id: existingArticle.id 
        });
        return data;
      }
      
      logger.info('Article already exists, skipping:', { 
        title: article.title,
        id: existingArticle.id,
        hasAnalysis: !!existingArticle.analysis
      });
      return existingArticle;
    }

    // Store new article
    const { data, error } = await this.supabase
      .from('articles')
      .insert([{
        ...article,
        unique_key: this.generateUniqueKey(article),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    
    logger.info('Stored new article:', { 
      title: article.title,
      id: data.id,
      hasAnalysis: !!article.analysis
    });
    
    return data;
  } catch (error) {
    logger.error('Failed to store article:', {
      error: error.message,
      title: article.title
    });
    throw error;
  }
} 