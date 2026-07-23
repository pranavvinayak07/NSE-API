import { NextRequest, NextResponse } from 'next/server';
import { fetchMasterChainInfo, calcATM, NIFTY_STEP } from '@/lib/nse';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const monthMap: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

function parseNseDate(dStr: string): Date {
  const parts = dStr.split('-');
  if (parts.length === 3) {
    return new Date(parseInt(parts[2], 10), monthMap[parts[1]] ?? 0, parseInt(parts[0], 10));
  }
  return new Date(dStr);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    let spot: number | null = null;
    let expiries: string[] = [];
    let timestamp = '';
    let source = 'live';

    // Fast Path: Check if recent DB backup exists (< 5 mins old) for instant response
    const latestBackup = await prisma.optionChainBackup.findFirst({
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true, underlyingValue: true, availableExpiries: true, expiry: true, atmStrike: true },
    });

    const now = new Date();
    const backupAgeSec = latestBackup ? Math.floor((now.getTime() - new Date(latestBackup.timestamp).getTime()) / 1000) : Infinity;

    if (latestBackup && backupAgeSec < 300 && Array.isArray(latestBackup.availableExpiries) && latestBackup.availableExpiries.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const validExpiries = (latestBackup.availableExpiries as string[]).filter((e) => {
        const expDate = parseNseDate(e);
        return expDate >= today;
      });

      if (validExpiries.length > 0) {
        spot = latestBackup.underlyingValue;
        expiries = validExpiries;
        timestamp = latestBackup.timestamp.toISOString();
        source = 'recent_backup';

        const atmStrike = latestBackup.atmStrike ?? (spot !== null ? calcATM(spot, NIFTY_STEP) : null);

        return NextResponse.json({
          expiries,
          spot,
          atmStrike,
          timestamp,
          source,
        }, {
          status: 200,
          headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' },
        });
      }
    }

    // Live NSE Fetch if DB snapshot is > 5 mins old or missing
    try {
      const liveInfo = await fetchMasterChainInfo();
      spot = liveInfo.spot;
      expiries = liveInfo.expiries;
      timestamp = liveInfo.timestamp;
    } catch (liveErr) {
      console.warn('[expiries] Live NSE fetch failed, falling back to DB:', liveErr instanceof Error ? liveErr.message : liveErr);
    }

    // Fallback to database backup if live expiries are missing
    if ((!expiries || expiries.length === 0) && latestBackup) {
      source = 'backup';
      spot = latestBackup.underlyingValue;
      timestamp = latestBackup.timestamp.toISOString();

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (Array.isArray(latestBackup.availableExpiries) && latestBackup.availableExpiries.length > 0) {
        expiries = (latestBackup.availableExpiries as string[]).filter((e) => {
          const expDate = parseNseDate(e);
          return expDate >= today;
        });
      }
      if (expiries.length === 0 && latestBackup.expiry) {
        expiries = [latestBackup.expiry];
      }
    }

    let atmStrike = null;
    if (spot !== null) {
      atmStrike = calcATM(spot, NIFTY_STEP);
    }

    return NextResponse.json({
      expiries,
      spot,
      atmStrike,
      timestamp,
      source,
    }, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error occurred';
    return NextResponse.json({ error: 'Failed to fetch expiries', details: message }, { status: 500 });
  }
}
