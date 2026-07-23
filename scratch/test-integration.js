// Register ts-node to run typescript files directly
require('ts-node').register({
  compilerOptions: {
    module: 'commonjs',
  },
});

const { fetchOptionChain } = require('../lib/nse-fetch');
const { fetchContractOHLC } = require('../lib/ohlc-enricher');

async function test() {
  try {
    console.log('Testing fetchOptionChain("NIFTY")...');
    const data = await fetchOptionChain('NIFTY');
    console.log('Success! Option chain fetched.');
    console.log('Underlying Value:', data.records.underlyingValue);
    console.log('Expiries count:', data.records.expiryDates.length);
    console.log('Strikes count:', data.records.data.length);
    console.log('First Expiry Date:', data.records.expiryDates[0]);

    console.log('\nTesting fetchContractOHLC("NIFTY")...');
    // Using default (fallback) mode to fetch nearest expiry + selected strikes around ATM automatically
    const ohlcResult = await fetchContractOHLC('NIFTY');
    console.log('Success! OHLC fetched.');
    console.log('Underlying spot price from IIFL:', ohlcResult.underlyingValue);
    console.log('Nearest Expiry:', ohlcResult.nearestExpiry);
    const keys = Object.keys(ohlcResult.ohlcMap);
    console.log('OHLC map size:', keys.length);
    console.log('Sample key details:');
    if (keys.length > 0) {
      const sampleKey = keys[0];
      console.log(`Key ${sampleKey}:`, ohlcResult.ohlcMap[sampleKey]);
    }
  } catch (err) {
    console.error('Error during test:', err);
  }
}

test();
