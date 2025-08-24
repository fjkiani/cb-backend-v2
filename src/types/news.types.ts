// Defines the canonical structure for a news article within our application
export interface InternalArticle {
  id?: number | string; // Optional: Database ID might be added after storing
  title: string;
  url: string; 
  content?: string; // Often fetched separately or unavailable initially
  publishedAt: string; // ISO 8601 format string
  sourceName: string; // e.g., 'RealTimeNews', 'TradingEconomics'
  category?: string;
  createdAt?: string; // When we added it
  updatedAt?: string; // When we last updated it
  // Add other common fields you might normalize later (e.g., standardized sentiment)
}

// Defines the structure for parameters used in searching news
export interface NewsSearchParams {
  query?: string;
  limit?: number;
  // Add other common search params like category, country etc.
}

// Interface for any news source adapter
export interface INewsProvider {
  // Method to search for news based on parameters
  searchNews(params: NewsSearchParams): Promise<InternalArticle[]>;
  
  // Could add other methods like fetchLatestNews(), fetchArticleById(id), etc.
} 