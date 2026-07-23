const { NSE } = require('nse-bse-api');

async function main() {
  try {
    console.log("Initializing NSE Client...");
    const nse = new NSE('./downloads');

    console.log("Fetching option chain for NIFTY...");
    const data = await nse.optionChain("NIFTY");
    
    console.log("records keys:", Object.keys(data.records));
    console.log("expiryDates:", data.records.expiryDates.slice(0, 5));
    console.log("strikePrices (first 5):", data.records.strikePrices.slice(0, 5));
    if (data.records.data && data.records.data.length > 0) {
      const sample = data.records.data.find(item => item.CE || item.PE);
      console.log("Sample item strikePrice:", sample.strikePrice);
      console.log("Sample item CE:", JSON.stringify(sample.CE, null, 2));
      console.log("Sample item PE:", JSON.stringify(sample.PE, null, 2));
    }

    console.log("\nFetching equity quote for RELIANCE...");
    const eqQuote = await nse.equity.getEquityQuote("RELIANCE");
    console.log("Equity quote:", eqQuote);

    console.log("Exiting client...");
    await nse.exit();
  } catch (err) {
    console.error("Error running test:", err);
  }
}

main();
