// ── NIFTY Option Chain Dashboard — Type Definitions ─────────────────────────

/**
 * Raw NSE API response shape for a single derivative contract.
 * Endpoint: /api/NextApi/apiClient/GetQuoteApi?functionName=getTradeInfoDerivative
 */
export interface NSEDerivativeMetaData {
  high: string;
  low: string;
  last?: string;
  optiontype: string;
  strikeprice: string;
  underlyingValue?: string; // present in some responses
  [key: string]: unknown;
}

export interface NSEDerivativeResponseItem {
  metaData: NSEDerivativeMetaData;
  [key: string]: unknown;
}

export interface NSEDerivativeApiResponse {
  derivateResponse: NSEDerivativeResponseItem[];
  [key: string]: unknown;
}

/** Shape of NSE allIndices response item. */
export interface NSEIndexItem {
  indexSymbol: string;
  last: number;
  previousClose: number;
  [key: string]: unknown;
}

/** Processed row for a single strike (one CE + one PE combined). */
export interface OptionRow {
  strike: number;
  ceHigh: number | null;
  ceLow: number | null;
  peHigh: number | null;
  peLow: number | null;
  ceLTP?: number | null;
  peLTP?: number | null;
  ceS?: number | null;
  peS?: number | null;
  difference?: number | null;
  average?: number | null;
}

/** ATM ± N range options. */
export type StrikeRange = 5 | 10 | 15;

/** Diagnostics metadata returned with every API response. */
export interface ApiDiagnostics {
  /** Whether data came from live NSE, database backup, or disk cache. */
  source: 'live' | 'recent_backup' | 'backup' | 'stale' | 'cache';
  /** ISO timestamp of when the data was fetched/retrieved. */
  fetchedAt: string;
  /** How old the data is, in minutes. */
  dataAgeMinutes: number;
  /** How old the data is, in seconds. */
  dataAgeSeconds?: number;
  /** True if data is older than 30 minutes. */
  isStale?: boolean;
  /** Number of expiry dates available. */
  expiryCount: number;
  /** Number of strike rows returned. */
  strikeCount: number;
  /** The expiry date currently selected or served. */
  selectedExpiry: string;
}

/** API route response payload. */
export interface OptionChainApiResponse {
  data: OptionRow[];
  timestamp: string;
  lastUpdated?: string;
  expiry: string;
  /** Total number of strikes attempted. */
  total: number;
  /** Number of strikes where data was successfully fetched. */
  successful: number;
  /** Live NIFTY spot / underlying value. */
  underlyingValue: number | null;
  /** ATM strike computed from spot. */
  atmStrike: number | null;
  /** Range used: 5, 10, or 15. */
  range: StrikeRange;
  /** Data source: 'live' | 'recent_backup' | 'backup' | 'stale' | 'cache'. */
  source: 'live' | 'recent_backup' | 'backup' | 'stale' | 'cache';
  /** How old the data is in seconds. */
  dataAge?: number;
  /** Whether the data is stale (>= 30 mins). */
  isStale?: boolean;
  /** Diagnostic metadata for debugging. */
  diagnostics: ApiDiagnostics;
}

/** Error response from the API route. */
export interface OptionChainApiError {
  error: string;
  details?: string;
}

/** Sort direction for the table. */
export type SortDirection = 'asc' | 'desc';
