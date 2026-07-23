import fs from 'fs';
import path from 'path';
import type { NSEApiResponse } from '@/types/option-chain';

// ── Cache entry shape ────────────────────────────────────────────────
export interface CacheEntry {
  data:      NSEApiResponse;
  fetchedAt: string;  // ISO string
  symbol:    string;
}

// ── In-memory store (persists across warm serverless invocations) ────
const memoryCache = new Map<string, CacheEntry>();

// ── Temp-file path for persistence across cold starts ────────────────
function tmpPath(symbol: string): string {
  // /tmp is writable on Vercel & most Node environments
  const dir = process.env.CACHE_DIR ?? '/tmp';
  return path.join(dir, `nse-cache-${symbol}.json`);
}

// ── Write to disk ────────────────────────────────────────────────────
function persist(symbol: string, entry: CacheEntry): void {
  try {
    fs.writeFileSync(tmpPath(symbol), JSON.stringify(entry), 'utf8');
  } catch (error) {
    console.warn('[nse-cache] Failed to persist cache to disk:', error instanceof Error ? error.message : String(error));
  }
}

// ── Read from disk ───────────────────────────────────────────────────
function loadFromDisk(symbol: string): CacheEntry | null {
  try {
    const raw = fs.readFileSync(tmpPath(symbol), 'utf8');
    const parsed = JSON.parse(raw) as CacheEntry;
    if (parsed?.data?.records?.data) return parsed;
  } catch (error) {
    console.warn('[nse-cache] Failed to load cache from disk:', error instanceof Error ? error.message : String(error));
  }
  return null;
}

// ── Public API ───────────────────────────────────────────────────────

/** Save a successful API response to cache */
export function setCached(symbol: string, data: NSEApiResponse): void {
  const entry: CacheEntry = {
    data,
    symbol,
    fetchedAt: new Date().toISOString(),
  };
  memoryCache.set(symbol, entry);
  persist(symbol, entry);
}

/** Get cached data for a symbol (memory first, then disk) */
export function getCached(symbol: string): CacheEntry | null {
  // 1. Check in-memory
  const mem = memoryCache.get(symbol);
  if (mem) return mem;

  // 2. Hydrate from disk and warm the memory cache
  const disk = loadFromDisk(symbol);
  if (disk) {
    memoryCache.set(symbol, disk);
    return disk;
  }

  return null;
}

/** True if we have any cached data for the symbol */
export function hasCached(symbol: string): boolean {
  return getCached(symbol) !== null;
}

/** Format the cached-at time as a human-readable string */
export function formatCachedAt(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, '0');
  const dd = pad(d.getDate());
  const mo = pad(d.getMonth() + 1);
  const yy = d.getFullYear();
  const hh = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());
  return `${dd}-${mo}-${yy} ${hh}:${mm}:${ss}`;
}
