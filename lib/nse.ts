/**
 * lib/nse.ts
 * ──────────────────────────────────────────────────────────────────────────
 * Server-side helper for the NIFTY Option Chain Dashboard.
 */

import type { OptionRow, NSEDerivativeApiResponse } from '@/types/option';
import { fetchOptionChain, retry } from './nse-fetch';

export const NIFTY_STEP = 50;

/**
 * DEFAULT_EXPIRY is intentionally null.
 * If live NSE data returns zero expiries, we MUST fail loudly
 * rather than silently falling back to a hardcoded stale date.
 */
export const DEFAULT_EXPIRY: string | null = null;

const NSE_BASE = 'https://www.nseindia.com';
const NSE_DERIVATIVE_API = `${NSE_BASE}/api/NextApi/apiClient/GetQuoteApi`;

const NSE_HEADERS: HeadersInit = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Referer: `${NSE_BASE}/option-chain`,
  'X-Requested-With': 'XMLHttpRequest',
  Connection: 'keep-alive',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Site': 'same-origin',
};

const FETCH_TIMEOUT_MS = 12_000;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 600;

export function calcATM(spot: number, step = NIFTY_STEP): number {
  return Math.round(spot / step) * step;
}

export function getStrikesForRange(atm: number, range: number, step = NIFTY_STEP): number[] {
  const strikes: number[] = [];
  for (let i = -range; i <= range; i++) {
    strikes.push(atm + i * step);
  }
  return strikes;
}

export function normalizeExpiry(expiry: string): string {
  if (!expiry) return '';
  const parts = expiry.split('-');
  if (parts.length !== 3) return expiry;
  
  let month = parts[1];
  if (month && isNaN(Number(month))) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const idx = months.findIndex(m => m.toLowerCase() === month.toLowerCase());
    if (idx !== -1) {
      month = (idx + 1).toString().padStart(2, '0');
    }
  }

  return `${parts[0]}-${month}-${parts[2]}`;
}

function buildIdentifier(expiry: string, optionType: 'CE' | 'PE', strike: number): string {
  const formattedExpiry = normalizeExpiry(expiry);
  return `OPTIDXNIFTY${formattedExpiry}${optionType}${strike}.00`;
}

function parsePrice(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = parseFloat(raw);
  return isNaN(n) ? null : n;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

import type { StrikeData } from '@/types/option-chain';
import { getCached, setCached } from './nse-cache';

// ── Shared Cache ─────────────────────────────────────────────────────────────
interface MasterChainCache {
  spot: number | null;
  expiries: string[];
  lastUpdatedTime: string;
  timestamp: number;
  fullData: StrikeData[];
}
let masterChainCache: MasterChainCache | null = null;
const MASTER_CACHE_TTL = 10_000;

export async function fetchMasterChainInfo(): Promise<{ spot: number | null, expiries: string[], timestamp: string, fullData: StrikeData[] }> {
  const now = Date.now();
  if (masterChainCache && (now - masterChainCache.timestamp) < MASTER_CACHE_TTL) {
    console.log('[fetchMasterChainInfo] Returning memory-cached data (age:', now - masterChainCache.timestamp, 'ms)');
    return { spot: masterChainCache.spot, expiries: masterChainCache.expiries, timestamp: masterChainCache.lastUpdatedTime, fullData: masterChainCache.fullData };
  }

  // Check persistent disk cache before external network hit
  const diskCache = getCached('NIFTY');
  if (diskCache && diskCache.data?.records) {
    const ageMs = now - new Date(diskCache.fetchedAt).getTime();
    if (ageMs < MASTER_CACHE_TTL) {
      console.log('[fetchMasterChainInfo] Returning disk-cached data (age:', ageMs, 'ms)');
      const rec = diskCache.data.records;
      masterChainCache = {
        spot: rec.underlyingValue ?? null,
        expiries: rec.expiryDates ?? [],
        lastUpdatedTime: rec.timestamp ?? diskCache.fetchedAt,
        timestamp: new Date(diskCache.fetchedAt).getTime(),
        fullData: rec.data ?? [],
      };
      return { spot: masterChainCache.spot, expiries: masterChainCache.expiries, timestamp: masterChainCache.lastUpdatedTime, fullData: masterChainCache.fullData };
    }
  }

  try {
    console.log('[fetchMasterChainInfo] Fetching fresh data from NSE...');
    const data = await retry(() => fetchOptionChain('NIFTY'));
    
    // Save to persistent cache (memory + disk)
    setCached('NIFTY', data);

    masterChainCache = {
      spot: data.records.underlyingValue ?? null,
      expiries: data.records.expiryDates ?? [],
      lastUpdatedTime: data.records.timestamp ?? '',
      timestamp: now,
      fullData: data.records.data ?? [],
    };
    console.log('[fetchMasterChainInfo] Fresh data received & cached — spot:', masterChainCache.spot, '| expiries:', masterChainCache.expiries.length, '| timestamp:', masterChainCache.lastUpdatedTime);
    return { spot: masterChainCache.spot, expiries: masterChainCache.expiries, timestamp: masterChainCache.lastUpdatedTime, fullData: masterChainCache.fullData };
  } catch (err) {
    console.error('[fetchMasterChainInfo] ALL RETRIES EXHAUSTED:', err instanceof Error ? err.message : String(err));
    
    // Fall back to memory cache
    if (masterChainCache) {
      console.warn('[fetchMasterChainInfo] Returning memory cache fallback (age:', Date.now() - masterChainCache.timestamp, 'ms)');
      return { spot: masterChainCache.spot, expiries: masterChainCache.expiries, timestamp: masterChainCache.lastUpdatedTime, fullData: masterChainCache.fullData };
    }

    // Fall back to disk cache (even if older than TTL)
    if (diskCache && diskCache.data?.records) {
      console.warn('[fetchMasterChainInfo] Returning stale disk cache fallback');
      const rec = diskCache.data.records;
      return {
        spot: rec.underlyingValue ?? null,
        expiries: rec.expiryDates ?? [],
        timestamp: rec.timestamp ?? diskCache.fetchedAt,
        fullData: rec.data ?? [],
      };
    }

    return { spot: null, expiries: [], timestamp: '', fullData: [] };
  }
}

// Keep this for backwards compatibility if needed, but it's preferred to use fetchMasterChainInfo
export async function fetchNiftySpot(signal?: AbortSignal): Promise<number | null> {
  const { spot } = await fetchMasterChainInfo();
  return spot;
}

export async function getOptionData(
  expiry: string,
  strike: number,
  optionType: 'CE' | 'PE',
  signal?: AbortSignal,
): Promise<{ high: number | null; low: number | null; last: number | null } | null> {
  const identifier = buildIdentifier(expiry, optionType, strike);

  const url = new URL(NSE_DERIVATIVE_API);
  url.searchParams.set('functionName', 'getTradeInfoDerivative');
  url.searchParams.set('symbol', 'NIFTY');
  url.searchParams.set('identifier', identifier);
  url.searchParams.set('type', 'W');

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const timeoutCtrl = new AbortController();
    const timeoutId = setTimeout(() => timeoutCtrl.abort(), FETCH_TIMEOUT_MS);

    const combinedSignal = signal
      ? AbortSignal.any([signal, timeoutCtrl.signal])
      : timeoutCtrl.signal;

    try {
      const res = await fetch(url.toString(), {
        headers: NSE_HEADERS,
        signal: combinedSignal,
        cache: 'no-store',
        next: { revalidate: 0 },
      } as RequestInit & { next?: { revalidate: number } });

      clearTimeout(timeoutId);
      console.log(`[getOptionData] ${url.toString()} -> ${res.status}`);

      if (!res.ok) {
        if (res.status === 429 && attempt < MAX_RETRIES) {
          await sleep(RETRY_DELAY_MS * attempt * 2);
          continue;
        }
        return null;
      }

      const json: NSEDerivativeApiResponse = await res.json();
      const meta = json?.derivateResponse?.[0]?.metaData;
      if (!meta) {
        console.log(`[getOptionData] No meta:`, JSON.stringify(json).slice(0, 200));
        return null;
      }

      return {
        high: parsePrice(meta.high),
        low: parsePrice(meta.low),
        last: parsePrice(meta.last),
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);

      if (err instanceof Error && err.name === 'AbortError') return null;

      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
      return null;
    }
  }

  return null;
}

async function fetchStrike(expiry: string, strike: number, signal?: AbortSignal): Promise<OptionRow> {
  const [ce, pe] = await Promise.all([
    getOptionData(expiry, strike, 'CE', signal),
    getOptionData(expiry, strike, 'PE', signal),
  ]);

  return {
    strike,
    ceHigh: ce?.high ?? null,
    ceLow: ce?.low ?? null,
    peHigh: pe?.high ?? null,
    peLow: pe?.low ?? null,
    ceLTP: ce?.last ?? null,
    peLTP: pe?.last ?? null,
  };
}

// ── In-Memory Cache for Option Chain Data ─────────────────────────────────────
interface ChainCacheEntry {
  data: OptionRow[];
  timestamp: number;
}
const chainCache: Record<string, ChainCacheEntry> = {};
const CHAIN_CACHE_TTL = 10_000;

export async function fetchOptionChainData(
  expiry: string,
  strikes: number[],
  signal?: AbortSignal,
  fullData?: StrikeData[],
): Promise<OptionRow[]> {
  const cacheKey = `${expiry}-${strikes.join(',')}`;
  const now = Date.now();
  
  if (chainCache[cacheKey] && (now - chainCache[cacheKey].timestamp) < CHAIN_CACHE_TTL) {
    console.log('[fetchOptionChainData] Returning cached chain data');
    return chainCache[cacheKey].data;
  }

  console.log(`[fetchOptionChainData] Fetching ${strikes.length} strikes for expiry ${expiry}`);

  const BATCH_SIZE = 4;
  const results: OptionRow[] = [];

  for (let i = 0; i < strikes.length; i += BATCH_SIZE) {
    if (signal?.aborted) break;

    const batch = strikes.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (strike) => {
        const row = await fetchStrike(expiry, strike, signal);
        // Inject High/Low and LTP from fullData if live API returned null
        if (fullData && fullData.length > 0) {
          const normalizedRequestedExpiry = normalizeExpiry(expiry);
          const strikeData = fullData.find(d => 
            d.strikePrice === strike && 
            normalizeExpiry(d.expiryDate) === normalizedRequestedExpiry
          );
          if (strikeData) {
            // High/Low fallback from master chain (0 means no trade)
            if (!row.ceHigh && strikeData.CE?.highPrice) row.ceHigh = strikeData.CE.highPrice;
            if (!row.ceLow && strikeData.CE?.lowPrice) row.ceLow = strikeData.CE.lowPrice;
            if (!row.peHigh && strikeData.PE?.highPrice) row.peHigh = strikeData.PE.highPrice;
            if (!row.peLow && strikeData.PE?.lowPrice) row.peLow = strikeData.PE.lowPrice;

            // LTP fallback
            if (!row.ceLTP && strikeData.CE?.lastPrice) row.ceLTP = strikeData.CE.lastPrice;
            if (!row.peLTP && strikeData.PE?.lastPrice) row.peLTP = strikeData.PE.lastPrice;
          }
        }
        return row;
      }),
    );
    results.push(...batchResults);

    if (i + BATCH_SIZE < strikes.length) {
      await sleep(150);
    }
  }

  console.log(`[fetchOptionChainData] Completed — ${results.length} rows, first: ${results[0]?.strike}, last: ${results[results.length - 1]?.strike}`);

  chainCache[cacheKey] = {
    data: results,
    timestamp: Date.now(),
  };

  return results;
}
