// Register ts-node
require('ts-node').register({
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    target: 'es2020',
    esModuleInterop: true,
  },
});

const { fetchContractOHLC } = require('../lib/ohlc-enricher');

async function main() {
  try {
    console.log('Calling fetchContractOHLC("NIFTY")...');
    const res = await fetchContractOHLC('NIFTY');
    console.log('Result underlying value:', res.underlyingValue);
    console.log('Result nearest expiry:', res.nearestExpiry);
    console.log('ohlcMap keys count:', Object.keys(res.ohlcMap).length);
    console.log('ohlcMap sample (23550):', res.ohlcMap['23550_CE'], res.ohlcMap['23550_PE']);
    console.log('ohlcMap keys:', Object.keys(res.ohlcMap).slice(0, 10));
  } catch (err) {
    console.error('Direct fetch failed with error:', err);
  }
}

main();
