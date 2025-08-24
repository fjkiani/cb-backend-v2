// backend/src/types/article.types.ts
export interface DiffbotArticle {
    title: string;
    content: string;
    url: string;
    date?: string;
    publishedAt?: string;
    source?: string;
    category?: string;
    sentiment?: {
      score?: number;
      label?: string;
      confidence?: number;
    };
    discussion?: {
      posts?: Array<{
        id: string;
        text: string;
        date: string;
        sentiment?: number;
        author?: string;
      }>;
    };
    raw_data?: any;
  }