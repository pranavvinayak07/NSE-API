import type { SymbolType, StrikeRange } from '@/types/option-chain';

export const SYMBOLS: { value: SymbolType; label: string; lotSize: number; stepSize: number }[] = [
  { value: 'NIFTY',      label: 'NIFTY 50',         lotSize: 75,  stepSize: 50  },
  { value: 'BANKNIFTY',  label: 'BANK NIFTY',        lotSize: 35,  stepSize: 100 },
  { value: 'FINNIFTY',   label: 'FIN NIFTY',         lotSize: 65,  stepSize: 50  },
  { value: 'MIDCPNIFTY', label: 'MIDCAP NIFTY',      lotSize: 120, stepSize: 25  },
];

export const STRIKE_RANGES: { value: StrikeRange; label: string }[] = [
  { value: 5,  label: 'ATM ± 5'  },
  { value: 10, label: 'ATM ± 10' },
  { value: 15, label: 'ATM ± 15' },
];

export const NSE_BASE_URL = 'https://www.nseindia.com';
export const NSE_OPTION_CHAIN_URL = `${NSE_BASE_URL}/api/option-chain-indices?symbol=`;
/** Returns OHLC + metadata for ALL derivative contracts of a symbol in one call */
export const NSE_QUOTE_DERIVATIVE_URL = `${NSE_BASE_URL}/api/quote-derivative?symbol=`;

export const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Referer': 'https://www.nseindia.com/option-chain',
  'X-Requested-With': 'XMLHttpRequest',
  'Connection': 'keep-alive',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

export const FETCH_TIMEOUT_MS = 15000;
export const RATE_LIMIT_WINDOW_MS = 10000; // 10 seconds
export const RATE_LIMIT_MAX_REQUESTS = 5;
