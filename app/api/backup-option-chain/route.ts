import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getStrikesForRange, NIFTY_STEP } from '@/lib/nse';
import type { OptionChainApiResponse, ApiDiagnostics, StrikeRange } from '@/types/option';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function dataAgeMinutes(timestamp: string | Date): number {
  const ts = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  return Math.floor((Date.now() - ts.getTime()) / 60000);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const rawRange = parseInt(searchParams.get('range') ?? '5', 10);
  const range: StrikeRange = ([5, 10, 15] as StrikeRange[]).includes(rawRange as StrikeRange)
    ? (rawRange as StrikeRange)
    : 5;

  try {
    const now = new Date();
    const latestBackup = await prisma.optionChainBackup.findFirst({
      orderBy: { timestamp: 'desc' },
    });

    if (!latestBackup) {
      return NextResponse.json({ error: 'No backup data found in database.' }, { status: 404 });
    }

    let dataRows = latestBackup.data as unknown as any[];
    const backupAtm = latestBackup.atmStrike;
    
    if (backupAtm) {
      const requestedStrikes = getStrikesForRange(backupAtm, range, NIFTY_STEP);
      dataRows = dataRows.filter((r) => requestedStrikes.includes(r.strike));
    }

    const backupTimestamp = latestBackup.timestamp.toISOString();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const monthMap: Record<string, number> = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    function parseNseDate(dStr: string) {
      const parts = dStr.split('-');
      if (parts.length === 3) {
        return new Date(parseInt(parts[2], 10), monthMap[parts[1]] || 0, parseInt(parts[0], 10));
      }
      return new Date(dStr);
    }

    let backupExpiries = [latestBackup.expiry];
    if (Array.isArray(latestBackup.availableExpiries) && latestBackup.availableExpiries.length > 0) {
      backupExpiries = (latestBackup.availableExpiries as string[]).filter((e) => {
        const expDate = parseNseDate(e);
        return expDate >= today;
      });
      if (backupExpiries.length === 0) backupExpiries = [latestBackup.expiry];
    }

    const diagnostics: ApiDiagnostics = {
      source: 'backup',
      fetchedAt: now.toISOString(),
      dataAgeMinutes: dataAgeMinutes(latestBackup.timestamp),
      expiryCount: backupExpiries.length,
      strikeCount: dataRows.length,
      selectedExpiry: latestBackup.expiry,
    };

    const payload: Omit<OptionChainApiResponse, 'availableExpiries'> & { availableExpiries?: string[] } = {
      data: dataRows,
      timestamp: backupTimestamp,
      expiry: latestBackup.expiry,
      total: dataRows.length,
      successful: dataRows.length,
      underlyingValue: latestBackup.underlyingValue,
      atmStrike: backupAtm,
      range,
      source: 'backup',
      diagnostics,
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'X-Data-Source': 'Database-Backup',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error occurred';
    return NextResponse.json(
      { error: 'Failed to fetch backup option chain data.', details: message },
      { status: 500 },
    );
  }
}
