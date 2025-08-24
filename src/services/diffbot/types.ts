export interface DiffbotConfig {
  apiToken: string;
  apiUrl?: string;
}

export interface DiffbotObject {
  type: string;
  title?: string;
  text?: string;
  html?: string;
  date?: string;
  author?: string;
  authorUrl?: string;
  discussion?: {
    posts: DiffbotPost[];
    numPosts?: number;
    provider?: string;
  };
  sentiment?: {
    score: number;
    type: 'positive' | 'negative' | 'neutral';
  };
  tags?: string[];
  categories?: string[];
}

export interface DiffbotPost {
  id: string;
  text: string;
  html?: string;
  title?: string;
  author?: string;
  date?: string;
  sentiment?: {
    score: number;
    type: 'positive' | 'negative' | 'neutral';
  };
}

export interface DiffbotResponse {
  objects: DiffbotObject[];
  url: string;
  title?: string;
  humanLanguage?: string;
  errorCode?: number;
  errorMessage?: string;
  timestamp?: string;
  requestId?: string;
}

// Optional: Add types for specific API endpoints
export interface DiffbotAnalyzeRequest {
  url: string;
  mode?: 'article' | 'discussion' | 'product' | 'image' | 'video';
  fields?: string[];
} 