const { fetchContractOHLC } = require('./lib/ohlc-enricher');

async function main() {
  try {
    console.log("Calling fetchContractOHLC('NIFTY')...");
    const result = await fetchContractOHLC('NIFTY');
    console.log("Success! nearestExpiry:", result.nearestExpiry);
    console.log("OHLC map size:", Object.keys(result.ohlcMap).length);
  } catch (err) {
    console.error("Failed:", err);
  }
}

main();
