export class MarketDataService {
  async getImmediateReaction({ tickers, timestamp, timeWindow = '15m' }) {
    try {
      // Get market data for the specified tickers
      const marketData = await Promise.all(tickers.map(async ticker => {
        const before = await this.getPriceData(ticker, {
          start: new Date(timestamp.getTime() - this.parseTimeWindow(timeWindow)),
          end: timestamp
        });

        const after = await this.getPriceData(ticker, {
          start: timestamp,
          end: new Date(timestamp.getTime() + this.parseTimeWindow(timeWindow))
        });

        return {
          ticker,
          priceChange: this.calculatePriceChange(before, after),
          volumeChange: this.calculateVolumeChange(before, after),
          volatility: this.calculateVolatility(before, after)
        };
      }));

      return {
        overallImpact: this.calculateOverallImpact(marketData),
        tickerReactions: marketData,
        volatility: this.getAggregateVolatility(marketData),
        severity: this.calculateSeverity(marketData)
      };
    } catch (error) {
      this.logger.error('Failed to get market reaction:', error);
      throw error;
    }
  }

  private calculateSeverity(marketData: any[]): number {
    const factors = {
      priceChange: Math.max(...marketData.map(d => Math.abs(d.priceChange))),
      volumeSpike: Math.max(...marketData.map(d => d.volumeChange)),
      volatility: Math.max(...marketData.map(d => d.volatility))
    };

    return Math.min(5, 
      (factors.priceChange * 2) + 
      (factors.volumeSpike * 1.5) + 
      (factors.volatility * 1)
    );
  }
} 