interface SupabaseStorageOptions {
  mock?: boolean;
}

export declare class SupabaseStorage {
  constructor(options?: SupabaseStorageOptions);
  storeArticles(articles: any[]): Promise<any>;
  storeArticle(article: any): Promise<any>;
  getRecentArticles(limit?: number): Promise<{
    articles: any[];
    totalCount: number;
  }>;
  private ensureDate(dateInput: string | Date): Date;
  private generateUniqueKey(article: any): string;
} 