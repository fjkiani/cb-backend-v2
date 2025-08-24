import logger from '../logger.js';

// Hardcoded data for now
const DEFAULT_CATEGORIES = [
  {
    type: 'MARKET_NEWS',
    keywords: ['stock', 'market', 'trading', 'index'],
    weight: 2
  },
  {
    type: 'FED_NEWS',
    keywords: ['fed', 'federal reserve', 'interest rate'],
    weight: 3
  }
];

const DEFAULT_CLASSIFICATIONS = [
  {
    name: 'MARKET_MOVER',
    threshold: 5,
    importance: 3
  },
  {
    name: 'FED_NEWS',
    threshold: 1,
    importance: 4
  }
];

class NewsClassificationService {
  constructor() {
    this.categories = new Map();
    this.classifications = new Map();
    this.initializeDefaults();
  }

  initializeDefaults() {
    DEFAULT_CATEGORIES.forEach(cat => {
      this.categories.set(cat.type, cat);
    });
    DEFAULT_CLASSIFICATIONS.forEach(classification => {
      this.classifications.set(classification.name, classification);
    });
  }

  async loadClassifications() {
    // No need to load from DB, we're using hardcoded data
    return;
  }

  async determineNewsType(content) {
    const lowerContent = content.toLowerCase();

    for (const [type, data] of this.categories.entries()) {
      if (data.keywords.some(keyword => lowerContent.includes(keyword))) {
        return type;
      }
    }
    return 'GENERAL';
  }

  async calculateImportance(content, metadata) {
    let score = 1;

    for (const [name, data] of this.classifications.entries()) {
      if (this.meetsClassification(content, metadata, name, data)) {
        score += data.importance;
      }
    }

    return Math.min(score, 5);
  }

  meetsClassification(content, metadata, name, data) {
    // Implementation specific to each classification type
    switch (name) {
      case 'MARKET_MOVER':
        return metadata.percentageChanges.some(p => 
          Math.abs(parseFloat(p)) >= data.threshold
        );
      case 'FED_NEWS':
        return content.toLowerCase().includes('fed') || 
               content.toLowerCase().includes('federal reserve');
      // Add more classification types as needed
      default:
        return false;
    }
  }

  async classifyArticle(article) {
    const baseClassification = await this.determineNewsType(article.content);
    const importance = await this.calculateImportance(article.content, {
      percentageChanges: this.extractPercentages(article.content),
      marketMentions: this.extractMarketTerms(article.content)
    });

    return {
      type: baseClassification,
      importance,
      needsImmediateAnalysis: importance >= 3 || this.hasUrgentKeywords(article.content)
    };
  }

  hasUrgentKeywords(content) {
    const urgentTerms = [
      'breaking',
      'urgent',
      'alert',
      'just in',
      'federal reserve',
      'rate decision',
      'market crash',
      'emergency meeting'
    ];
    return urgentTerms.some(term => content.toLowerCase().includes(term));
  }

  extractPercentages(content) {
    const percentageRegex = /-?\d+(\.\d+)?%/g;
    return (content.match(percentageRegex) || [])
      .map(match => parseFloat(match));
  }

  extractMarketTerms(content) {
    const marketTerms = [
      'stock', 'market', 'index', 'bond', 'treasury',
      'nasdaq', 'dow', 's&p', 'russell', 'trading'
    ];
    return marketTerms.filter(term => 
      content.toLowerCase().includes(term)
    );
  }
}

export { NewsClassificationService }; 