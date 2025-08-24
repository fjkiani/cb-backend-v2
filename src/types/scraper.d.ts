declare module '.scraper' {
  export function scrapeNews(forceFresh?: boolean): Promise<any[]>;
  export function cleanup(): Promise<void>;
} 