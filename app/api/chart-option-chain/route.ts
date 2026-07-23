import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { OptionRow } from '@/types/option';

export const dynamic = 'force-dynamic';

/** Supported candle intervals in minutes */
const VALID_INTERVALS = [1, 2, 3, 4, 5, 10, 30, 60] as const;
type IntervalMin = (typeof VALID_INTERVALS)[number];

/** Groups a time-series array into interval-width buckets, keeping the last value per bucket */
function aggregateSeries(
  series: { time: number; value: number }[],
  intervalMin: IntervalMin,
): { time: number; value: number }[] {
  if (intervalMin <= 1 || series.length === 0) return series;

  const bucketSec = intervalMin * 60;
  const buckets = new Map<number, number>(); // bucketStart → last value

  for (const point of series) {
    const bucketStart = Math.floor(point.time / bucketSec) * bucketSec;
    buckets.set(bucketStart, point.value); // last value wins
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([time, value]) => ({ time, value }));
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const strikeParam = searchParams.get('strike');
  const timeframe = searchParams.get('timeframe') || '1D';
  const rawInterval = parseInt(searchParams.get('interval') ?? '1', 10);
  const intervalMin: IntervalMin = (VALID_INTERVALS as readonly number[]).includes(rawInterval)
    ? (rawInterval as IntervalMin)
    : 1;
  let expiryParam = searchParams.get('expiry');

  if (!strikeParam) {
    return NextResponse.json({ error: 'Missing strike parameter' }, { status: 400 });
  }

  const strike = parseInt(strikeParam, 10);

  try {
    // Fetch distinct expiries that have data in the DB (for metadata only)
    const dbExpiriesRaw = await prisma.optionChainBackup.findMany({
      distinct: ['expiry'],
      orderBy: { timestamp: 'desc' },
      select: { expiry: true },
    });
    const dbExpiries = ((dbExpiriesRaw as any[]) ?? []).map((r: any) => r.expiry).filter(Boolean) as string[];

    // Only auto-select DB expiry when NO expiry was given in the request.
    if (!expiryParam) {
      expiryParam = dbExpiries[0] ?? null;
    }

    // Get latest snapshot to resolve available strikes fast
    const latestOverallBackup = await prisma.optionChainBackup.findFirst({
      where: expiryParam ? { expiry: expiryParam } : undefined,
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true, data: true },
    });

    let availableStrikes: number[] = [];
    if (latestOverallBackup?.data) {
      const lastData = latestOverallBackup.data as unknown as OptionRow[];
      availableStrikes = lastData?.map(r => r.strike).sort((a, b) => a - b) || [];
    }

    // FAST PATH: If strike is 0 (initial metadata load before strike selection), return metadata immediately in ~10ms
    if (strike === 0) {
      const emptySeries = {
        ceLow: [], ceHigh: [], peLow: [], peHigh: [], ceLTP: [], peLTP: [],
        spot: [], ceS: [], peS: [], difference: [], average: [],
      };
      return NextResponse.json({
        series: emptySeries,
        availableStrikes,
        currentExpiry: expiryParam,
        interval: intervalMin,
        dbExpiries,
      });
    }

    // Determine the start date based on timeframe
    const refDate = latestOverallBackup ? new Date(latestOverallBackup.timestamp) : new Date();
    let startDate = new Date(refDate);
    startDate.setHours(0, 0, 0, 0);

    switch (timeframe) {
      case '1D':
        break;
      case '2D':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case '3D':
        startDate.setDate(startDate.getDate() - 2);
        break;
      case '4D':
        startDate.setDate(startDate.getDate() - 3);
        break;
      case '5D':
        startDate.setDate(startDate.getDate() - 4);
        break;
      case '6D':
        startDate.setDate(startDate.getDate() - 5);
        break;
      case '7D':
        startDate.setDate(startDate.getDate() - 6);
        break;
      case 'ALL':
      default:
        startDate = new Date(0);
        break;
    }

    const whereClause: any = {
      timestamp: { gte: startDate },
    };
    
    if (expiryParam) {
      whereClause.expiry = expiryParam;
    }

    // Query backups with selective field selection to maximize speed
    const backups = await prisma.optionChainBackup.findMany({
      where: whereClause,
      orderBy: { timestamp: 'asc' },
      select: {
        timestamp: true,
        underlyingValue: true,
        data: true,
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
      const time = Math.floor(new Date(b.timestamp).getTime() / 1000);
      const dataRows = b.data as unknown as OptionRow[];
      const row = dataRows?.find((r) => r.strike === strike);

      if (row) {
        if (row.ceLow != null && row.ceLow !== 0) series.ceLow.push({ time, value: row.ceLow });
        if (row.ceHigh != null && row.ceHigh !== 0) series.ceHigh.push({ time, value: row.ceHigh });
        if (row.peLow != null && row.peLow !== 0) series.peLow.push({ time, value: row.peLow });
        if (row.peHigh != null && row.peHigh !== 0) series.peHigh.push({ time, value: row.peHigh });
        if (row.ceLTP != null && row.ceLTP !== 0) series.ceLTP.push({ time, value: row.ceLTP });
        if (row.peLTP != null && row.peLTP !== 0) series.peLTP.push({ time, value: row.peLTP });

        const fA = row.peS !== undefined ? row.peS : ((row.ceHigh !== null && row.peLow !== null) ? (row.ceHigh + row.peLow) / 2 : null);
        const fB = row.ceS !== undefined ? row.ceS : ((row.ceLow !== null && row.peHigh !== null) ? (row.ceLow + row.peHigh) / 2 : null);

        const diff = row.difference !== undefined ? row.difference : (fA !== null && fB !== null ? fA - fB : null);
        const avg = row.average !== undefined ? row.average : (fA !== null && fB !== null ? (fA + fB) / 2 : null);

        if (fB !== null && fB !== 0) series.ceS.push({ time, value: fB });
        if (fA !== null && fA !== 0) series.peS.push({ time, value: fA });

        if (diff !== null) series.difference.push({ time, value: diff });
        if (avg !== null && avg !== 0) series.average.push({ time, value: avg });
      }

      if (b.underlyingValue != null && b.underlyingValue !== 0) {
        series.spot.push({ time, value: b.underlyingValue });
      }
    });

    // Aggregate all series by the requested interval
    const aggregatedSeries = {
      ceLow:      aggregateSeries(series.ceLow,      intervalMin),
      ceHigh:     aggregateSeries(series.ceHigh,     intervalMin),
      peLow:      aggregateSeries(series.peLow,      intervalMin),
      peHigh:     aggregateSeries(series.peHigh,     intervalMin),
      ceLTP:      aggregateSeries(series.ceLTP,      intervalMin),
      peLTP:      aggregateSeries(series.peLTP,      intervalMin),
      spot:       aggregateSeries(series.spot,       intervalMin),
      ceS:        aggregateSeries(series.ceS,        intervalMin),
      peS:        aggregateSeries(series.peS,        intervalMin),
      difference: aggregateSeries(series.difference, intervalMin),
      average:    aggregateSeries(series.average,    intervalMin),
    };

    return NextResponse.json({
      series: aggregatedSeries,
      availableStrikes,
      currentExpiry: expiryParam,
      interval: intervalMin,
      dbExpiries,       // ← expiries that actually have data in the DB
    });
  } catch (error: any) {
    console.error('Error fetching history:', error);
    return NextResponse.json({ error: 'Failed to fetch history data' }, { status: 500 });
  }
}
