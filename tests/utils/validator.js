class WebhookValidator {
  static RULES = {
    MIN_CONTENT_LENGTH: 100,
    MAX_CONTENT_LENGTH: 50000,
    REQUIRED_FIELDS: ['url', 'timestamp', 'content'],
    VALID_SELECTORS: ['.news-article', '.article-title', '.article-time'],
    URL_PATTERN: /^https:\/\/tradingeconomics\.com\/.*$/,
    ECONOMIC_INDICATORS: [
      'GDP', 'Inflation', 'Interest Rate', 'Unemployment', 
      'Non Farm Payrolls', 'CPI', 'PPI', 'Retail Sales'
    ],
    CONTENT_PATTERNS: {
      KEYWORDS: [
        'Federal Reserve', 'Fed', 'Treasury', 'Economic Growth',
        'Monetary Policy', 'Fiscal Policy', 'Economic Data'
      ],
      DATE_PATTERN: /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/,
      PERCENTAGE_PATTERN: /\d+\.?\d*%/,
      NUMBER_PATTERN: /\d+\.?\d+/,
      RATE_PATTERN: /\d+\.?\d*\s*-\s*\d+\.?\d*/
    },
    CONTENT_STRUCTURE: {
      minParagraphs: 2,
      maxParagraphs: 20,
      requiresDate: true,
      requiresNumbers: true
    }
  };

  static validateContent(content) {
    const errors = [];
    
    console.log('🔍 Validation Debug:');
    console.log('Text:', content.text);
    console.log('Percentages:', content.text.match(this.RULES.CONTENT_PATTERNS.PERCENTAGE_PATTERN));
    console.log('Paragraphs:', content.text.split('\n\n').length);

    const hasEconomicIndicator = this.RULES.ECONOMIC_INDICATORS.some(
      indicator => content.text.includes(indicator)
    );
    if (!hasEconomicIndicator) {
      errors.push('Content must contain at least one economic indicator');
    }

    const hasKeyword = this.RULES.CONTENT_PATTERNS.KEYWORDS.some(
      keyword => content.text.includes(keyword)
    );
    if (!hasKeyword) {
      errors.push('Content must contain relevant economic keywords');
    }

    if (this.RULES.CONTENT_STRUCTURE.requiresDate && 
        !this.RULES.CONTENT_PATTERNS.DATE_PATTERN.test(content.text)) {
      errors.push('Content must contain at least one date reference');
    }

    const percentages = content.text.match(this.RULES.CONTENT_PATTERNS.PERCENTAGE_PATTERN);
    if (!percentages) {
      errors.push('Content must contain numerical data (e.g., percentages)');
    }

    const hasNumbers = this.RULES.CONTENT_PATTERNS.NUMBER_PATTERN.test(content.text);
    const hasRates = this.RULES.CONTENT_PATTERNS.RATE_PATTERN.test(content.text);

    console.log('Content validation details:', {
      hasPercentage: !!percentages,
      hasNumbers,
      hasRates,
      textSample: content.text.substring(0, 100) // First 100 chars for debugging
    });

    if (!hasNumbers && !hasRates) {
      errors.push('Content must contain numerical data (e.g., percentages or rates)');
    }

    const paragraphs = content.text.split('\n\n');
    if (paragraphs.length < this.RULES.CONTENT_STRUCTURE.minParagraphs) {
      errors.push(`Content must have at least ${this.RULES.CONTENT_STRUCTURE.minParagraphs} paragraphs`);
    }

    return errors;
  }

  static validatePayload(payload) {
    const errors = [];

    // Check required fields
    this.RULES.REQUIRED_FIELDS.forEach(field => {
      if (!payload[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    });

    // Validate URL
    if (payload.url && !this.RULES.URL_PATTERN.test(payload.url)) {
      errors.push('Invalid URL: Must be a Trading Economics URL');
    }

    // Validate content structure
    if (payload.content) {
      if (!payload.content.title) {
        errors.push('Missing content title');
      }
      if (!payload.content.text) {
        errors.push('Missing content text');
      }
      if (payload.content.text && 
          payload.content.text.length < this.RULES.MIN_CONTENT_LENGTH) {
        errors.push(`Content text too short (minimum ${this.RULES.MIN_CONTENT_LENGTH} characters)`);
      }
      if (payload.content.text && 
          payload.content.text.length > this.RULES.MAX_CONTENT_LENGTH) {
        errors.push(`Content text too long (maximum ${this.RULES.MAX_CONTENT_LENGTH} characters)`);
      }
      const contentErrors = this.validateContent(payload.content);
      errors.push(...contentErrors);
    }

    // Validate timestamp
    if (payload.timestamp) {
      const timestamp = new Date(payload.timestamp);
      if (isNaN(timestamp.getTime())) {
        errors.push('Invalid timestamp format');
      }
    }

    // Validate selector
    if (payload.selector && !this.RULES.VALID_SELECTORS.includes(payload.selector)) {
      errors.push(`Invalid selector. Must be one of: ${this.RULES.VALID_SELECTORS.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = WebhookValidator; 