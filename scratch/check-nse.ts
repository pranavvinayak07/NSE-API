import { fetchMasterChainInfo, normalizeExpiry } from '../lib/nse';

async function main() {
  const { spot, expiries, timestamp, fullData } = await fetchMasterChainInfo();
  
  const requestedExpiry = expiries[0];
  const strike = fullData[0].strikePrice;
  const normalizedRequestedExpiry = normalizeExpiry(requestedExpiry);

  const strikeData = fullData.find(d => 
    d.strikePrice === strike && 
    normalizeExpiry(d.expiryDate) === normalizedRequestedExpiry
  );

  console.log("Requested Expiry:", requestedExpiry);
  console.log("Normalized Requested Expiry:", normalizedRequestedExpiry);
  console.log("First fullData expiryDate:", fullData[0].expiryDate);
  console.log("Normalized fullData expiryDate:", normalizeExpiry(fullData[0].expiryDate));
  console.log("StrikeData found:", !!strikeData);
}

main().catch(console.error);
