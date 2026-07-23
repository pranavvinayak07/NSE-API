/**
 * lib/nse-ltp.ts
 * ──────────────────────────────────────────────────────────────────────────
 * Fetches live CE and PE LTP values for NIFTY using the option-chain-v3 API
 * in a SINGLE HTTP request. This avoids the 22-request-per-5s pattern that
 * causes NSE IP bans.
 *
 * API used:
 *   GET https://www.nseindia.com/api/option-chain-v3
 *       ?type=Indices&symbol=NIFTY&expiry=16-Jun-2026
 *
 * The response includes `lastPrice` for every CE and PE strike for that
 * specific expiry — exactly what we need.
 *
 * Cache: 15 seconds TTL per expiry to prevent hammering NSE even when the
 * frontend polls every 5 seconds.
 */

import { calcATM, getStrikesForRange, NIFTY_STEP } from './nse';
import type { LTPRow } from '@/types/ltp';

const NSE_BASE = 'https://www.nseindia.com';
const NSE_V3_API = `${NSE_BASE}/api/option-chain-v3`;
const NSE_REFERER = `${NSE_BASE}/option-chain`;

const FETCH_TIMEOUT_MS = 15_000;
const CACHE_TTL_MS = 15_000; // 15 seconds — safe for NSE rate limits

// ── Session Cookie Cache ────────────────────────────────────────────────────
let cachedCookie: string | null = null;
let cookieFetchedAt = 0;
const COOKIE_TTL_MS = 5 * 60 * 1000; // re-fetch session every 5 minutes

async function getNseCookie(): Promise<string> {
  const now = Date.now();
  if (cachedCookie && now - cookieFetchedAt < COOKIE_TTL_MS) {
    return cachedCookie;
  }

  console.log('[nse-ltp] Fetching fresh NSE session cookie...');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(NSE_REFERER, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
        Connection: 'keep-alive',
      },
      signal: controller.signal,
      cache: 'no-store',
    });
    clearTimeout(timeoutId);

    const rawCookie = res.headers.get('set-cookie');
    if (rawCookie) {
      // Extract only the key=value pairs (strip directives like Path, HttpOnly etc.)
      cachedCookie = rawCookie
        .split(',')
        .map((c) => c.split(';')[0].trim())
        .join('; ');
      cookieFetchedAt = now;
      console.log('[nse-ltp] Cookie acquired');
    } else {
      // NSE sometimes skips cookies for certain DCs — continue without
      cachedCookie = '';
      cookieFetchedAt = now;
      console.warn('[nse-ltp] No cookie in NSE response — proceeding without');
    }
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('[nse-ltp] Failed to fetch NSE cookie:', err instanceof Error ? err.message : err);
    cachedCookie = cachedCookie ?? '';
  }

  return cachedCookie ?? '';
}

// ── Per-Expiry LTP Cache ────────────────────────────────────────────────────
interface CacheEntry {
  rows: LTPRow[];
  underlyingValue: number;
  timestamp: string;
  atmStrike: number;
  fetchedAt: number;
}
const ltpCache: Record<string, CacheEntry> = {};

// ── Internal: call option-chain-v3 with given headers ────────────────────────
async function callV3Api(expiry: string, cookie?: string): Promise<any> {
  const url = new URL(NSE_V3_API);
  url.searchParams.set('type', 'Indices');
  url.searchParams.set('symbol', 'NIFTY');
  url.searchParams.set('expiry', expiry);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url.toString(), {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        Referer: NSE_REFERER,
        'X-Requested-With': 'XMLHttpRequest',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        ...(cookie ? { Cookie: cookie } : {}),
      },
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`NSE V3 API HTTP ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ── Main Export ─────────────────────────────────────────────────────────────

/**
 * Fetches live LTP for CE and PE for a given expiry and ATM ± range.
 * Uses a single option-chain-v3 request — no per-strike GetQuoteApi calls.
 *
 * Strategy:
 *  1. Try V3 directly (no cookie) — fast path, works most of the time
 *  2. If data is empty, fetch a session cookie and retry — slow path (rare)
 *
 * @param expiry  NSE expiry string e.g. "16-Jun-2026"
 * @param range   Number of strikes above and below ATM (default 5)
 */
export async function fetchLTPFromV3(
  expiry: string,
  range = 5,
): Promise<CacheEntry> {
  const cacheKey = `${expiry}-${range}`;
  const now = Date.now();

  if (ltpCache[cacheKey] && now - ltpCache[cacheKey].fetchedAt < CACHE_TTL_MS) {
    console.log(
      `[nse-ltp] Cache hit for ${cacheKey} (age: ${now - ltpCache[cacheKey].fetchedAt}ms)`,
    );
    return ltpCache[cacheKey];
  }

  console.log(`[nse-ltp] Fetching option-chain-v3 for expiry=${expiry} range=${range}`);

  // ── Fast path: try without cookie first ──────────────────────────────────
  let json: any;
  try {
    json = await callV3Api(expiry);
    console.log(`[nse-ltp] V3 fast-path succeeded`);
  } catch (err) {
    console.warn(`[nse-ltp] V3 fast-path failed (${err instanceof Error ? err.message : err}), trying with cookie...`);
    json = null;
  }

  // ── Slow path: if no data, fetch cookie and retry ────────────────────────
  const rawDataCheck: any[] = Array.isArray(json?.records?.data) ? json.records.data : [];
  if (rawDataCheck.length === 0) {
    console.log(`[nse-ltp] Empty data — fetching NSE session cookie and retrying...`);
    const cookie = await getNseCookie();
    try {
      json = await callV3Api(expiry, cookie);
      console.log(`[nse-ltp] V3 slow-path (with cookie) succeeded`);
    } catch (err) {
      throw new Error(
        `[nse-ltp] Both V3 attempts failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // ── Parse response ────────────────────────────────────────────────────────
  const records = json?.records ?? {};
  const rawData: any[] = Array.isArray(records.data) ? records.data : [];
  const underlyingValue: number = Number(records.underlyingValue ?? 0);
  const timestamp: string = records.timestamp ?? new Date().toISOString();

  if (rawData.length === 0) {
    throw new Error('[nse-ltp] option-chain-v3 returned empty records.data even after retry');
  }

  // Compute ATM from the live spot price returned by this same API
  const atmStrike = calcATM(underlyingValue, NIFTY_STEP);
  const validStrikes = new Set(getStrikesForRange(atmStrike, range, NIFTY_STEP));

  // Build LTP rows — filter to only the strikes we need
  const rows: LTPRow[] = [];
  for (const item of rawData) {
    const strike = Number(item.CE?.strikePrice ?? item.PE?.strikePrice ?? item.strikePrice ?? 0);
    if (!validStrikes.has(strike)) continue;

    rows.push({
      strike,
      ceLTP: item.CE?.lastPrice != null ? Number(item.CE.lastPrice) : null,
      peLTP: item.PE?.lastPrice != null ? Number(item.PE.lastPrice) : null,
    });
  }

  // Sort ascending by strike
  rows.sort((a, b) => a.strike - b.strike);

  console.log(
    `[nse-ltp] Parsed ${rows.length} rows | spot: ${underlyingValue} | ATM: ${atmStrike} | timestamp: ${timestamp}`,
  );

  const entry: CacheEntry = { rows, underlyingValue, timestamp, atmStrike, fetchedAt: now };
  ltpCache[cacheKey] = entry;
  return entry;
}

/**
 * Invalidates the cookie cache — useful when NSE seems to be rejecting requests.
 */
export function invalidateNseCookie(): void {
  cachedCookie = null;
  cookieFetchedAt = 0;
}

