import { getOptionData } from '../lib/nse';
import { fetchMasterChainInfo } from '../lib/nse';

async function main() {
  const { expiries, fullData } = await fetchMasterChainInfo();
  const expiry = expiries[0];
  const strike = fullData[0].strikePrice;
  
  console.log("Testing quote for expiry:", expiry, "strike:", strike);
  
  const identifier = `OPTIDXNIFTY${expiry.split('-').join('')}CE${strike}.00`; // Just a dummy test
  // we will just use fetch directly to see raw output
  
  const url = `https://www.nseindia.com/api/NextApi/apiClient/GetQuoteApi?functionName=getTradeInfoDerivative&symbol=NIFTY&identifier=OPTIDXNIFTY16-06-2026CE${strike}.00&type=W`;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    Referer: `https://www.nseindia.com/option-chain`,
  };
  const res = await fetch(url, { headers });
  const json = await res.json();
  console.log(json?.derivateResponse?.[0]?.metaData);
}

main().catch(console.error);
