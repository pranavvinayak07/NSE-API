import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isMarketOpenIST } from '@/lib/market-hours';
import {
  fetchMasterChainInfo,
  fetchOptionChainData,
  calcATM,
  getStrikesForRange,
  NIFTY_STEP,
} from '@/lib/nse';
import { fetchLTPFromV3 } from '@/lib/nse-ltp';


export const dynamic = 'force-dynamic';
export const revalidate = 0;

const monthMap: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

function parseNseTimestamp(ts: string): Date {
  const parts = ts.trim().split(/[ \-:]+/);
  if (parts.length >= 6) {
    const day = parseInt(parts[0], 10);
    const month = monthMap[parts[1]] ?? 0;
    const year = parseInt(parts[2], 10);
    const hours = parseInt(parts[3], 10);
    const minutes = parseInt(parts[4], 10);
    const seconds = parseInt(parts[5], 10);
    // NSE returns IST. Create UTC, then subtract 5.5 hours to convert IST to universal UTC.
    const utcDate = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    return new Date(utcDate.getTime() - (5.5 * 60 * 60 * 1000));
  }
  
  const parsed = new Date(ts);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid NSE timestamp: ${ts}`);
  }
  return parsed;
}

export async function GET(request: Request) {
  // Check if called from Vercel Cron
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // ── Market Hours Validation ───────────────────────────────────────────
  if (!isMarketOpenIST()) {
    console.log(`[cron] Market is closed or it's a weekend. Skipping backup.`);
    return NextResponse.json({ message: 'Market is closed. Skipping backup.' });
  }

  try {
    const now = new Date();
    console.log('[cron] Starting backup...');
    const { spot, expiries, timestamp, fullData } = await fetchMasterChainInfo();

    if (expiries.length === 0) {
      console.error('[cron] No expiries returned from NSE — aborting backup');
      return NextResponse.json(
        { error: 'No expiry dates available from NSE. Aborting backup.' },
        { status: 502 }
      );
    }

    const targetExpiries = expiries.slice(0, 3);
    console.log(`[cron] NSE data — spot: ${spot}, timestamp: ${timestamp}, fullData: ${fullData.length} strikes`);
    console.log(`[cron] Will process ${targetExpiries.length} expiries: ${targetExpiries.join(', ')}`);

    // ── Stale data validation ─────────────────────────────────────────────
    // Reject if the NSE timestamp is older than 30 minutes
    if (timestamp) {
      console.log('[cron] Raw NSE timestamp:', timestamp);
      let nseTime: Date;
      try {
        nseTime = parseNseTimestamp(timestamp);
      } catch (parseErr) {
        console.error(`[cron] STALE DATA REJECTED — Invalid timestamp format: ${timestamp}`);
        return NextResponse.json(
          { error: `Stale NSE data rejected. Invalid timestamp format.`, nseTimestamp: timestamp },
          { status: 422 }
        );
      }
      const ageMinutes = (Date.now() - nseTime.getTime()) / 60000;

      if (ageMinutes > 30) {
        console.error(`[cron] STALE DATA REJECTED — NSE timestamp (${timestamp}) is ${Math.round(ageMinutes)} mins old.`);
        return NextResponse.json(
          { error: `Stale NSE data rejected. Data is ${Math.round(ageMinutes)} mins old.`, nseTimestamp: timestamp },
          { status: 422 }
        );
      }
    }

    if (spot === null) {
      console.error('[cron] Spot is null — aborting backup to prevent stale data');
      return NextResponse.json(
        { error: 'NSE spot price is null. Aborting backup.' },
        { status: 502 }
      );
    }

    let atmStrike: number | null = null;
    let strikes: number[];
    const range = 15;

    atmStrike = calcATM(spot, NIFTY_STEP);
    strikes = getStrikesForRange(atmStrike, range, NIFTY_STEP);

    console.log(`[cron] ATM: ${atmStrike}, strikes: ${strikes[0]}..${strikes[strikes.length - 1]} (${strikes.length} total)`);

    let snapshotTime = now;
    if (timestamp) {
      snapshotTime = parseNseTimestamp(timestamp);
    }

    let totalSuccessfulRows = 0;
    let totalSnapshotCount = 0;
    const backupIds: string[] = [];

    // Loop through the first 3 expiries
    for (const expiry of targetExpiries) {
      console.log(`\n[cron] === Processing Expiry: ${expiry} ===`);
      
      const rows = await fetchOptionChainData(expiry, strikes, undefined, fullData);
      const successful = rows.filter(
        (r) =>
          r.ceHigh !== null ||
          r.ceLow !== null ||
          r.peHigh !== null ||
          r.peLow !== null,
      ).length;
      totalSuccessfulRows += successful;

      console.log(`[cron] Fetched ${rows.length} rows, ${successful} with data`);

      // ── Patch LTP from option-chain-v3 (single request, no IP ban risk) ──
      let v3LtpMap: Map<number, { ceLTP: number | null; peLTP: number | null }> | null = null;
      try {
        const v3Result = await fetchLTPFromV3(expiry, 15);
        v3LtpMap = new Map(v3Result.rows.map((r) => [r.strike, { ceLTP: r.ceLTP, peLTP: r.peLTP }]));
        console.log(`[cron] V3 LTP fetched — ${v3Result.rows.length} strikes`);
      } catch (v3Err) {
        console.warn('[cron] V3 LTP fetch failed (will use fallback from fullData):', v3Err instanceof Error ? v3Err.message : v3Err);
      }

      // Merge V3 LTP into rows
      const ltpPatchedRows = rows.map((row) => {
        if (!v3LtpMap) return row;
        const v3 = v3LtpMap.get(row.strike);
        if (!v3) return row;
        return {
          ...row,
          ceLTP: v3.ceLTP || row.ceLTP,
          peLTP: v3.peLTP || row.peLTP,
        };
      });

      const enrichedRows = ltpPatchedRows.map((row) => {
        const fA = (row.ceHigh !== null && row.peLow !== null) ? (row.ceHigh + row.peLow) / 2 : null; // PE-S
        const fB = (row.ceLow !== null && row.peHigh !== null) ? (row.ceLow + row.peHigh) / 2 : null; // CE-S
        const diff = fA !== null && fB !== null ? fA - fB : null;
        const avg = fA !== null && fB !== null ? (fA + fB) / 2 : null;
        
        return {
          ...row,
          peS: fA,
          ceS: fB,
          difference: diff,
          average: avg,
        };
      });

      // Save to OptionChainBackup
      const backup = await prisma.optionChainBackup.create({
        data: {
          timestamp: snapshotTime,
          underlyingValue: spot,
          atmStrike,
          expiry,
          availableExpiries: expiries,
          data: enrichedRows as any,
        },
      });
      backupIds.push(backup.id);

      console.log(`[cron] OptionChainBackup created — id: ${backup.id}`);

      // Write per-strike OptionSnapshot rows
      try {
        const snapshotData = enrichedRows.map((row) => ({
          timestamp:  snapshotTime,
          expiry,
          strike:     row.strike,
          ceHigh:     row.ceHigh     ?? null,
          ceLow:      row.ceLow      ?? null,
          ceLTP:      row.ceLTP      ?? null,
          ceSynthetic:row.ceS        ?? null,
          peHigh:     row.peHigh     ?? null,
          peLow:      row.peLow      ?? null,
          peLTP:      row.peLTP      ?? null,
          peSynthetic:row.peS        ?? null,
          difference: row.difference ?? null,
          average:    row.average    ?? null,
          spot:       spot           ?? null,
          atmStrike:  atmStrike      ?? null,
        }));

        const result = await prisma.optionSnapshot.createMany({
          data: snapshotData,
          skipDuplicates: true,
        });

        totalSnapshotCount += result.count;
        console.log(`[cron] OptionSnapshot createMany returned count: ${result.count}`);
      } catch (snapshotErr: unknown) {
        const snapshotMessage = snapshotErr instanceof Error ? snapshotErr.message : 'Unknown error';
        console.error(`[cron] OptionSnapshot createMany FAILED:`, snapshotMessage);
        // Don't rethrow — the backup blob was already saved successfully
      }
    }

    // Retention policy moved to dedicated /api/cron/cleanup route

    return NextResponse.json({
      success: true,
      message: 'Backup completed successfully',
      backupIds,
      spot,
      atmStrike,
      expiriesProcessed: targetExpiries,
      totalSuccessfulRows,
      totalSnapshotCount,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error occurred';
    console.error('[cron] BACKUP FAILED:', message);
    if (err instanceof Error && err.stack) {
      console.error('[cron] Stack:', err.stack);
    }
    return NextResponse.json(
      { error: 'Failed to backup option chain data.', details: message },
      { status: 500 }
    );
  }
}
