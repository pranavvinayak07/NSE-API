import { NextRequest, NextResponse } from 'next/server';
import { fetchMasterChainInfo, fetchOptionChainData, calcATM, getStrikesForRange, NIFTY_STEP } from '@/lib/nse';
import { generateOptionChainExcel } from '@/lib/excel-generator';
import type { ProcessedStrike, StrikeRange } from '@/types/option-chain';
import { formatForFilename } from '@/lib/date-utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const expiryParam = searchParams.get('expiry');
  
  const rawRange = parseInt(searchParams.get('range') ?? '5', 10);
  const rangeParam: StrikeRange = ([5, 10, 15] as StrikeRange[]).includes(rawRange as StrikeRange)
    ? (rawRange as StrikeRange)
    : 5;

  const symbol = 'NIFTY';

  const ctrl = new AbortController();
  const reqSignal = (request as unknown as { signal?: AbortSignal }).signal;
  // Bug #4: Eager abort check instead of accumulating event listeners
  if (reqSignal?.aborted) {
    ctrl.abort();
  }

  try {
    console.log('[download] Starting download generation...');
    const { spot, expiries, timestamp } = await fetchMasterChainInfo();

    let expiry = expiryParam;
    let dataSource: 'live' | 'backup' = 'live';

    if (!expiry || (expiries.length > 0 && !expiries.includes(expiry))) {
      if (expiries.length > 0) {
        expiry = expiries[0];
      } else {
        throw new Error('No expiry dates available from NSE.');
      }
    }
    
    let atmStrike: number;
    let strikes: number[] = [];

    if (spot !== null) {
      atmStrike = calcATM(spot, NIFTY_STEP);
      strikes = getStrikesForRange(atmStrike, rangeParam, NIFTY_STEP);
    } else {
      // Spot unavailable — use last known ATM from DB, or fail loudly
      dataSource = 'backup';
      const { prisma } = await import('@/lib/db');
      const latestBackup = await prisma.optionChainBackup.findFirst({
        orderBy: { timestamp: 'desc' },
        select: { atmStrike: true },
      });
      if (!latestBackup?.atmStrike) {
        throw new Error(
          'Unable to determine ATM strike: NSE spot unavailable and no backup found in DB.'
        );
      }
      atmStrike = latestBackup.atmStrike;
      strikes = getStrikesForRange(atmStrike, rangeParam, NIFTY_STEP);
    }

    console.log(`[download] spot: ${spot}, atm: ${atmStrike}, expiry: ${expiry}, source: ${dataSource}`);

    const rows = await fetchOptionChainData(expiry, strikes, ctrl.signal);

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'No option chain data available.' }, { status: 404 });
    }

    const processedStrikes: ProcessedStrike[] = rows.map(r => {
      const fA = r.ceHigh !== null && r.peLow !== null ? (r.ceHigh + r.peLow) / 2 : 0;
      const fB = r.ceLow !== null && r.peHigh !== null ? (r.ceLow + r.peHigh) / 2 : 0;
      return {
        strikePrice: r.strike,
        callHigh: r.ceHigh ?? 0,
        callLow: r.ceLow ?? 0,
        putHigh: r.peHigh ?? 0,
        putLow: r.peLow ?? 0,
        formulaA: fA,
        formulaB: fB,
        difference: Math.abs(fA - fB),
        average: (fA + fB) / 2,
        isATM: r.strike === atmStrike,
      };
    });

    const apiTimestamp = timestamp || new Date().toISOString();
    const underlyingValue = spot ?? 0;
    
    const buffer = await generateOptionChainExcel(processedStrikes, {
      symbol, underlyingValue, atmStrike, timestamp: apiTimestamp, range: rangeParam,
    });

    const filename = `NSE_${symbol}_OptionChain_ATM${rangeParam}_${formatForFilename(new Date())}.xlsx`;
    return new Response(buffer.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control':       'no-store',
        'X-Data-Source':       dataSource === 'live' ? 'NSE-Live' : 'Database-Backup',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unable to fetch live market data.';
    console.error('[download] ERROR:', message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
