const Driver = require('../models/driver');
const request = require('../lib/request');
const Ticker = require('../models/ticker');
const { parseToFloat } = require('../lib/utils');

/**
 * @memberof Driver
 * @augments Driver
 */
class Bitmart extends Driver {
  /**
   * @augments Driver.fetchTickers
   * @returns {Promise.Array<Ticker>} Returns a promise of an array with tickers.
   */
  async fetchTickers() {
    const { data: { tickers } } = await request('https://api-cloud.bitmart.com/spot/v1/ticker');

    return tickers.map((ticker) => {
      const [base, quote] = ticker.url.split('=').pop().split('_');

      return new Ticker({
        base,
        quote,
        open: parseToFloat(ticker.open_24h),
        high: parseToFloat(ticker.high_24h),
        low: parseToFloat(ticker.low_24h),
        close: parseToFloat(ticker.close_24h),
        baseVolume: parseToFloat(ticker.base_volume_24h),
        quoteVolume: parseToFloat(ticker.quote_volume_24h),
        bid: parseToFloat(ticker.best_bid),
        ask: parseToFloat(ticker.best_ask),
      });
    });
  }
}

module.exports = Bitmart;
