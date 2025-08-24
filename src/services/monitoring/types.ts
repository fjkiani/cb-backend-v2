export interface ChangeDetectionResult {
  hasChanged: boolean;
  currentUrl?: string;
  articles: Array<{
    title: string;
    url: string;
    publishedAt: string;
  }>;
}

export interface IChangeDetectionService {
  checkForChanges(): Promise<ChangeDetectionResult>;
} 