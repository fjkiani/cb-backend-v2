// Market analysis configuration
const marketIndicators = {
  bearish: [
    'fell',
    'down',
    'lower',
    'decline',
    'drop',
    'negative',
    'bearish',
    'decreased',
    'losses',
    'worried'
  ],
  
  bullish: [
    'rose',
    'up',
    'higher',
    'gain',
    'surge',
    'positive',
    'bullish',
    'increased',
    'growth',
    'optimistic'
  ],
  
  sectors: {
    tech: ['tech', 'nasdaq', 'software', 'semiconductor', 'ai', 'digital'],
    finance: ['banks', 'financial', 'credit', 'lending', 'mortgage'],
    healthcare: ['health', 'biotech', 'pharma', 'medical'],
    energy: ['oil', 'gas', 'energy', 'renewable', 'solar']
  },
  
  topics: {
    fed: ['fed', 'federal reserve', 'interest rate', 'monetary'],
    inflation: ['inflation', 'cpi', 'price index', 'cost'],
    economy: ['gdp', 'economy', 'economic', 'growth', 'recession'],
    employment: ['jobs', 'employment', 'unemployment', 'payroll', 'labor']
  }
};

export default marketIndicators; 