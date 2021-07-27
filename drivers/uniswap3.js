const Driver = require('../models/driver');
const request = require('../lib/request');
const Ticker = require('../models/ticker');
const { parseToFloat } = require('../lib/utils');

/**
 * @memberof Driver
 * @augments Driver
 */
class Uniswap3 extends Driver {
  constructor() {
    super({
      supports: {
        specificMarkets: true,
      },
    });
  }

  /**
   * @param {Array} ids IDs of the pools to retrieve
   * @param {number|null} blockNumber Block number on which the pool data should be based
   * @returns {Promise.Array} Array with the requested pools
   */
  async getPools(ids, blockNumber = null) {
    // By default request the current top 1000 markets with the highest volume.
    const selectQuery = ids ? `where: {id_in: ["${ids.join('", "')}"]}` : 'where: {liquidity_gt: 0 volumeUSD_gt: 0}';
    const blockQuery = blockNumber ? `block: {number: ${blockNumber}}` : '';

    const { data: { pools } } = await request({
      method: 'POST',
      url: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3',
      json: {
        query: `
          {
            pools(first: 1000 ${selectQuery} ${blockQuery} orderBy: volumeUSD orderDirection: desc) {
                id
                token0 {id symbol name}
                token1 {id symbol name}
                token1Price volumeToken0 volumeToken1
            }
          }
        `,
      },
    });

    return pools;
  }

  /**
   * @param {boolean} isMocked Set to true when stored tickers are used
   * @returns {Promise.Number}
   *   Returns a number that should be a blocknumber of
   *   Ethereum that was mined 24 hours ago
   */
  async blockNumber24hAgo(isMocked) {
    const timestampInSeconds = Math.round(Date.now() / 1000);
    const oneDayInSeconds = 24 * 60 * 60;
    let timestampYesterdayInSeconds = timestampInSeconds - oneDayInSeconds;

    if (isMocked) {
      // Dirty fix for testing. The fixture has a timestamp in the query.
      // Because of that the test could not find the fixture.
      timestampYesterdayInSeconds = 1627305331;
    }

    const { data: { blocks } } = await request({
      method: 'POST',
      url: 'https://api.thegraph.com/subgraphs/name/blocklytics/ethereum-blocks',
      json: {
        query: `
        {
          blocks(
            first: 1,
            orderBy: timestamp,
            orderDirection: desc,
            where: {
              timestamp_gt: ${timestampYesterdayInSeconds},
              timestamp_lt: ${timestampYesterdayInSeconds + 600}
            }
          ) {
            number,
            timestamp
          }
        }
        `,
      },
    });

    const [block] = blocks;

    return block.number;
  }

  /**
   * @param {boolean} isMocked Set to true when stored tickers are used
   * @augments Driver.fetchTickers
   * @returns {Promise.Array<Ticker>} Returns a promise of an array with tickers.
   */
  async fetchTickers(isMocked) {
    const pools = await this.getPools(this.markets);

    // The base and quote volumes are total volumes of the market's existence,
    // so we need to subtract the volumes that were reported 24 hours ago.
    const blockNumber = await this.blockNumber24hAgo(isMocked);
    const idsToRetrieve = pools.map((pool) => pool.id);
    const pools24hAgo = await this.getPools(idsToRetrieve, blockNumber);

    const indexedPools24hAgo = [];

    pools24hAgo.forEach((pool) => {
      indexedPools24hAgo[pool.id] = pool;
    });

    return pools.map((pool) => {
      const pool24hAgo = indexedPools24hAgo[pool.id];

      const baseVolume24hAgo = pool24hAgo ? parseToFloat(pool24hAgo.volumeToken0) : 0;
      const baseVolume = parseToFloat(pool.volumeToken0) - baseVolume24hAgo;
      const quoteVolume24hAgo = pool24hAgo ? parseToFloat(pool24hAgo.volumeToken1) : 0;
      const quoteVolume = parseToFloat(pool.volumeToken1) - quoteVolume24hAgo;

      return new Ticker({
        base: pool.token0.symbol,
        baseName: pool.token0.name,
        baseReference: pool.token0.id,
        quote: pool.token1.symbol,
        quoteName: pool.token1.name,
        quoteReference: pool.token1.id,
        close: parseToFloat(pool.token1Price),
        baseVolume,
        quoteVolume,
      });
    });
  }
}

module.exports = Uniswap3;
