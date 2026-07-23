/**
 * types/ltp.ts
 * TypeScript types for the /api/ltp endpoint.
 */

export interface LTPRow {
  strike: number;
  ceLTP: number | null;
  peLTP: number | null;
}

export interface LTPApiResponse {
  expiry: string;
  atmStrike: number;
  underlyingValue: number;
  /** NSE data timestamp string e.g. "16-Jun-2026 15:30" */
  timestamp: string;
  rows: LTPRow[];
  /** When this response was served (ISO string) */
  fetchedAt: string;
  /** Source cache age in ms */
  cacheAgeMs: number;
}
