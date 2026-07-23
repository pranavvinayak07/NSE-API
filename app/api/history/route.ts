import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { OptionRow } from '@/types/option';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const strikeParam = searchParams.get('strike');
  const timeframe = searchParams.get('timeframe') || '1D';

  if (!strikeParam) {
    return NextResponse.json({ error: 'Missing strike parameter' }, { status: 400 });
  }

  const strike = parseInt(strikeParam, 10);

  // Determine the start date based on the timeframe
  const now = new Date();
  let startDate = new Date();

  switch (timeframe) {
    case '1D':
      startDate.setDate(now.getDate() - 1);
      break;
    case '2D':
      startDate.setDate(now.getDate() - 2);
      break;
    case '3D':
      startDate.setDate(now.getDate() - 3);
      break;
    case '4D':
      startDate.setDate(now.getDate() - 4);
      break;
    case '5D':
      startDate.setDate(now.getDate() - 5);
      break;
    case '6D':
      startDate.setDate(now.getDate() - 6);
      break;
    case '7D':
      startDate.setDate(now.getDate() - 7);
      break;
    case 'ALL':
    default:
      // Arbitrary past date to get all data
      startDate = new Date(0);
      break;
  }

  try {
    const backups = await prisma.optionChainBackup.findMany({
      where: {
        timestamp: {
          gte: startDate,
        },
      },
      orderBy: {
        timestamp: 'asc',
      },
    });

    const series = {
      ceLow: [] as { time: number; value: number }[],
      ceHigh: [] as { time: number; value: number }[],
      peLow: [] as { time: number; value: number }[],
      peHigh: [] as { time: number; value: number }[],
      spot: [] as { time: number; value: number }[],
      ceS: [] as { time: number; value: number }[],
      peS: [] as { time: number; value: number }[],
      ceLTP: [] as { time: number; value: number }[],
      peLTP: [] as { time: number; value: number }[],
      difference: [] as { time: number; value: number }[],
      average: [] as { time: number; value: number }[],
    };

    ((backups as any[]) ?? []).forEach((b: any) => {
      // time in seconds for lightweight-charts
      const time = Math.floor(new Date(b.timestamp).getTime() / 1000);

      const dataRows = b.data as unknown as OptionRow[];
      const row = dataRows?.find((r) => r.strike === strike);

      if (row) {
        if (row.ceLow != null) series.ceLow.push({ time, value: row.ceLow });
        if (row.ceHigh != null) series.ceHigh.push({ time, value: row.ceHigh });
        if (row.peLow != null) series.peLow.push({ time, value: row.peLow });
        if (row.peHigh != null) series.peHigh.push({ time, value: row.peHigh });
        if (row.ceLTP != null) series.ceLTP.push({ time, value: row.ceLTP });
        if (row.peLTP != null) series.peLTP.push({ time, value: row.peLTP });

        // Custom computed metrics (matching OptionChainTable formulas)
        // Prefer pre-calculated values from DB if available, else fallback to calculation for older backups
        const fA = row.peS !== undefined ? row.peS : ((row.ceHigh !== null && row.peLow !== null) ? (row.ceHigh + row.peLow) / 2 : null); // PE-S
        const fB = row.ceS !== undefined ? row.ceS : ((row.ceLow !== null && row.peHigh !== null) ? (row.ceLow + row.peHigh) / 2 : null); // CE-S

        const diff = row.difference !== undefined ? row.difference : (fA !== null && fB !== null ? fA - fB : null);
        const avg = row.average !== undefined ? row.average : (fA !== null && fB !== null ? (fA + fB) / 2 : null);

        if (fB !== null) series.ceS.push({ time, value: fB });
        if (fA !== null) series.peS.push({ time, value: fA });

        if (diff !== null) series.difference.push({ time, value: diff });
        if (avg !== null) series.average.push({ time, value: avg });
      }

      if (b.underlyingValue != null) {
        series.spot.push({ time, value: b.underlyingValue });
      }
    });

    // Get available strikes from the latest backup, or from live NSE if no backups exist
    let availableStrikes: number[] = [];
    if (backups && backups.length > 0) {
      const lastData = backups[backups.length - 1].data as unknown as OptionRow[];
      availableStrikes = lastData?.map(r => r.strike).sort((a, b) => a - b) || [];
    } else {
      // No backups — fetch live strikes from NSE for the dropdown
      try {
        const { fetchMasterChainInfo, calcATM, getStrikesForRange, NIFTY_STEP } = await import('@/lib/nse');
        const { spot } = await fetchMasterChainInfo();
        if (spot !== null) {
          const atm = calcATM(spot, NIFTY_STEP);
          availableStrikes = getStrikesForRange(atm, 15, NIFTY_STEP);
        }
      } catch (err) {
        console.warn('[history] Failed to fetch live strikes:', err);
      }
    }

    return NextResponse.json({
      series,
      availableStrikes,
    });
  } catch (error: any) {
    console.error('Error fetching history:', error);
    return NextResponse.json({ error: 'Failed to fetch history data' }, { status: 500 });
  }
}
