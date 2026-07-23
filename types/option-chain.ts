// NSE Option Chain API response types

export interface OptionData {
  strikePrice: number;
  expiryDate: string;
  highPrice: number;
  lowPrice: number;
  openPrice: number;
  closePrice: number;
  lastPrice: number;
  change: number;
  pChange: number;
  totalTradedVolume: number;
  openInterest: number;
  changeinOpenInterest: number;
  pchangeinOpenInterest: number;
  impliedVolatility: number;
  totalBuyQuantity: number;
  totalSellQuantity: number;
  bidQty: number;
  bidprice: number;
  askQty: number;
  askPrice: number;
  underlyingValue: number;
}

export interface StrikeData {
  strikePrice: number;
  expiryDate: string;
  CE?: OptionData;
  PE?: OptionData;
}

export interface NSERecords {
  expiryDates: string[];
  data: StrikeData[];
  timestamp: string;
  underlyingValue: number;
  strikePrices: number[];
}

export interface NSEFiltered {
  expiryDates: string[];
  data: StrikeData[];
  CE: { totOI: number; totVol: number };
  PE: { totOI: number; totVol: number };
}

export interface NSEApiResponse {
  records: NSERecords;
  filtered: NSEFiltered;
}

export interface ProcessedStrike {
  strikePrice: number;
  callHigh: number;
  callLow: number;
  putHigh: number;
  putLow: number;
  formulaA: number;
  formulaB: number;
  difference: number;
  average: number;
  isATM: boolean;
}

export interface PreviewData {
  symbol: string;
  underlyingValue: number;
  atmStrike: number;
  strikeCount: number;
  timestamp: string;
  strikes: ProcessedStrike[];
  /** True when data was loaded from an uploaded CSV file */
  fromCSV?: boolean;
  /** Total rows parsed from the CSV */
  totalRows?: number;
  /** Whether High/Low came from live NSE fetch or LTP approximation */
  ohlcSource?: 'live' | 'ltp-approx';
}

export type SymbolType = 'NIFTY' | 'BANKNIFTY' | 'FINNIFTY' | 'MIDCPNIFTY';
export type StrikeRange = 5 | 10 | 15;
