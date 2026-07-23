/**
 * app/api/option-chain/route.ts
 * ──────────────────────────────────────────────────────────────────────────
 * GET /api/option-chain?expiry=09-Jun-2026&range=10
 *
 * Architecture:
 * 1. Checks if fresh DB snapshot exists (< 60s) -> serve immediately (fast path).
 * 2. Attempts direct live NSE fetch.
 * 3. Fallback to latest database snapshot (status 200 with source: 'recent_backup' | 'stale').
 * 4. Fallback to disk cache (/tmp/nse-cache-NIFTY.json).
 * 5. Returns 502 only if all data sources are completely unavailable.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  fetchMasterChainInfo,
  fetchOptionChainData,
  calcATM,
  getStrikesForRange,
  NIFTY_STEP,
} from '@/lib/nse';
import { prisma } from '@/lib/db';
import { getCached } from '@/lib/nse-cache';
import type { OptionChainApiResponse, ApiDiagnostics, StrikeRange, OptionRow } from '@/types/option';

/** Do not cache this route — data freshness is calculated dynamically. */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

function dataAgeSeconds(timestamp: string | Date): number {
  const ts = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return Math.max(0, Math.floor((Date.now() - ts.getTime()) / 1000));
}

// ── Database Fallback Helper ──────────────────────────────────────────────────
async function getDatabaseFallback(requestedExpiry: string | null, range: StrikeRange) {
  const latestBackup = requestedExpiry
    ? (await prisma.optionChainBackup.findFirst({
        where: { expiry: requestedExpiry },
        orderBy: { timestamp: 'desc' },
      })) ?? (await prisma.optionChainBackup.findFirst({ orderBy: { timestamp: 'desc' } }))
    : await prisma.optionChainBackup.findFirst({ orderBy: { timestamp: 'desc' } });

  if (!latestBackup) return null;

  let dataRows = latestBackup.data as unknown as OptionRow[];
  const backupAtm = latestBackup.atmStrike;
  
  if (backupAtm) {
    const requestedStrikes = getStrikesForRange(backupAtm, range, NIFTY_STEP);
    dataRows = dataRows.filter((r) => requestedStrikes.includes(r.strike));
  }

  const ageSec = dataAgeSeconds(latestBackup.timestamp);
  const ageMin = Math.floor(ageSec / 60);
  const isStale = ageSec >= 1800; // >= 30 mins
  const source: 'recent_backup' | 'stale' = isStale ? 'stale' : 'recent_backup';

  const diagnostics: ApiDiagnostics = {
    source,
    fetchedAt: new Date().toISOString(),
    dataAgeMinutes: ageMin,
    dataAgeSeconds: ageSec,
    isStale,
    expiryCount: Array.isArray(latestBackup.availableExpiries) ? (latestBackup.availableExpiries as string[]).length : 1,
    strikeCount: dataRows.length,
    selectedExpiry: latestBackup.expiry,
  };

  const payload: OptionChainApiResponse & { availableExpiries?: string[] } = {
    data: dataRows,
    timestamp: latestBackup.timestamp.toISOString(),
    lastUpdated: latestBackup.timestamp.toISOString(),
    expiry: latestBackup.expiry,
    total: dataRows.length,
    successful: dataRows.length,
    underlyingValue: latestBackup.underlyingValue,
    atmStrike: backupAtm,
    range,
    source,
    dataAge: ageSec,
    isStale,
    diagnostics,
    availableExpiries: Array.isArray(latestBackup.availableExpiries) ? (latestBackup.availableExpiries as string[]) : [latestBackup.expiry],
  };

  return payload;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const expiryParam = searchParams.get('expiry');

  const rawRange = parseInt(searchParams.get('range') ?? '5', 10);
  const range: StrikeRange = ([5, 10, 15] as StrikeRange[]).includes(rawRange as StrikeRange)
    ? (rawRange as StrikeRange)
    : 5;

  const ctrl = new AbortController();
  const reqSignal = (request as unknown as { signal?: AbortSignal }).signal;
  if (reqSignal?.aborted) {
    ctrl.abort();
  }

  const now = new Date();

  // ── Strategy Step 1: Check if DB snapshot is fresh (< 60 seconds) ───────────
  try {
    const freshDbBackup = await getDatabaseFallback(expiryParam, range);
    if (freshDbBackup && freshDbBackup.dataAge !== undefined && freshDbBackup.dataAge < 60) {
      console.log(`[option-chain] Fast path — serving fresh DB snapshot (age: ${freshDbBackup.dataAge}s)`);
      return NextResponse.json(freshDbBackup, {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Content-Type-Options': 'nosniff',
          'X-Data-Source': 'Database-Fresh-Snapshot',
        },
      });
    }
  } catch (dbCheckErr) {
    console.warn('[option-chain] Initial DB snapshot check failed:', dbCheckErr instanceof Error ? dbCheckErr.message : dbCheckErr);
  }

  // ── Strategy Step 2: Direct NSE Live Request ──────────────────────────────
  try {
    console.log('[option-chain] Attempting live fetch from NSE...');
    const { spot, expiries, timestamp, fullData } = await fetchMasterChainInfo();

    if (spot !== null && expiries.length > 0) {
      let expiry = expiryParam;
      if (!expiry || !expiries.includes(expiry)) {
        expiry = expiries[0];
      }

      const atmStrike = calcATM(spot, NIFTY_STEP);
      const strikes = getStrikesForRange(atmStrike, range, NIFTY_STEP);

      const rows = await fetchOptionChainData(expiry, strikes, ctrl.signal, fullData);

      const successful = rows.filter(
        (r) => r.ceHigh !== null || r.ceLow !== null || r.peHigh !== null || r.peLow !== null,
      ).length;

      const ageSec = timestamp ? dataAgeSeconds(timestamp) : 0;
      const ageMin = Math.floor(ageSec / 60);

      const diagnostics: ApiDiagnostics = {
        source: 'live',
        fetchedAt: now.toISOString(),
        dataAgeMinutes: ageMin,
        dataAgeSeconds: ageSec,
        isStale: false,
        expiryCount: expiries.length,
        strikeCount: rows.length,
        selectedExpiry: expiry,
      };

      console.log(`[option-chain] Serving LIVE data — spot: ${spot}, atm: ${atmStrike}, expiry: ${expiry}, rows: ${rows.length}`);

      // Dual Persistence: save successful direct NSE fetch to database snapshot in background
      prisma.optionChainBackup.create({
        data: {
          timestamp: now,
          underlyingValue: spot,
          atmStrike,
          expiry,
          availableExpiries: expiries,
          data: rows as any,
        },
      }).catch((dbSaveErr: unknown) => {
        console.warn('[option-chain] Background DB snapshot save failed:', dbSaveErr instanceof Error ? dbSaveErr.message : dbSaveErr);
      });

      const payload: OptionChainApiResponse & { availableExpiries?: string[] } = {
        data: rows,
        timestamp: timestamp || now.toISOString(),
        lastUpdated: timestamp || now.toISOString(),
        expiry,
        total: rows.length,
        successful,
        underlyingValue: spot,
        atmStrike,
        range,
        source: 'live',
        dataAge: ageSec,
        isStale: false,
        diagnostics,
        availableExpiries: expiries,
      };

      return NextResponse.json(payload, {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Content-Type-Options': 'nosniff',
          'X-Data-Source': 'NSE-Live',
        },
      });
    }
  } catch (liveErr) {
    console.warn('[option-chain] Direct live fetch failed:', liveErr instanceof Error ? liveErr.message : liveErr);
  }

  // ── Strategy Step 3: Database Backup Fallback ──────────────────────────────
  try {
    const dbFallback = await getDatabaseFallback(expiryParam, range);
    if (dbFallback) {
      console.log(`[option-chain] Serving DB backup fallback — source: ${dbFallback.source}, age: ${dbFallback.dataAge}s`);
      return NextResponse.json(dbFallback, {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'X-Content-Type-Options': 'nosniff',
          'X-Data-Source': `Database-Fallback-${dbFallback.source}`,
        },
      });
    }
  } catch (dbErr) {
    console.error('[option-chain] Database backup fallback failed:', dbErr instanceof Error ? dbErr.message : dbErr);
  }

  // ── Strategy Step 4: Disk Cache Fallback ──────────────────────────────────
  try {
    const diskCache = getCached('NIFTY');
    if (diskCache && diskCache.data?.records) {
      const rec = diskCache.data.records;
      const spot = rec.underlyingValue ?? null;
      const expiries = rec.expiryDates ?? [];
      const expiry = expiryParam && expiries.includes(expiryParam) ? expiryParam : (expiries[0] ?? '');
      
      if (spot && expiry) {
        const atmStrike = calcATM(spot, NIFTY_STEP);
        const strikes = getStrikesForRange(atmStrike, range, NIFTY_STEP);
        const ageSec = dataAgeSeconds(diskCache.fetchedAt);
        const isStale = ageSec >= 1800;
        
        const payload: OptionChainApiResponse & { availableExpiries?: string[] } = {
          data: [],
          timestamp: diskCache.fetchedAt,
          lastUpdated: diskCache.fetchedAt,
          expiry,
          total: strikes.length,
          successful: 0,
          underlyingValue: spot,
          atmStrike,
          range,
          source: 'cache',
          dataAge: ageSec,
          isStale,
          diagnostics: {
            source: 'cache',
            fetchedAt: now.toISOString(),
            dataAgeMinutes: Math.floor(ageSec / 60),
            dataAgeSeconds: ageSec,
            isStale,
            expiryCount: expiries.length,
            strikeCount: 0,
            selectedExpiry: expiry,
          },
          availableExpiries: expiries,
        };

        return NextResponse.json(payload, {
          status: 200,
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'X-Data-Source': 'Disk-Cache-Fallback',
          },
        });
      }
    }
  } catch (diskErr) {
    console.error('[option-chain] Disk cache fallback failed:', diskErr);
  }

  // ── Strategy Step 5: Exhausted all options ────────────────────────────────
  return NextResponse.json(
    { error: 'Failed to fetch option chain data. Live NSE and Database backups are unavailable.' },
    { status: 502 },
  );
}
