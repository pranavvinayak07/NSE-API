/**
 * app/api/ltp/route.ts
 * ──────────────────────────────────────────────────────────────────────────
 * GET /api/ltp?expiry=16-Jun-2026&range=5
 *
 * Returns live CE and PE LTP values for ATM ± range strikes using a
 * SINGLE call to NSE's option-chain-v3 API.
 *
 * This is completely separate from /api/option-chain and does NOT use
 * the GetQuoteApi that was causing 30-minute IP bans.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchLTPFromV3, invalidateNseCookie } from '@/lib/nse-ltp';
import type { LTPApiResponse } from '@/types/ltp';
import type { StrikeRange } from '@/types/option';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const expiry = searchParams.get('expiry') ?? '';

  const rawRange = parseInt(searchParams.get('range') ?? '5', 10);
  const range: StrikeRange = ([5, 10, 15] as StrikeRange[]).includes(rawRange as StrikeRange)
    ? (rawRange as StrikeRange)
    : 5;

  if (!expiry) {
    return NextResponse.json(
      { error: 'Missing required query parameter: expiry' },
      { status: 400 },
    );
  }

  try {
    const result = await fetchLTPFromV3(expiry, range);

    const payload: LTPApiResponse = {
      expiry,
      atmStrike: result.atmStrike,
      underlyingValue: result.underlyingValue,
      timestamp: result.timestamp,
      rows: result.rows,
      fetchedAt: new Date().toISOString(),
      cacheAgeMs: Date.now() - result.fetchedAt,
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'X-Data-Source': 'NSE-V3-Live',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[/api/ltp] Error:', message);

    // If NSE rejected us (possible cookie expiry), invalidate cookie so
    // the next request will get a fresh session.
    if (message.includes('403') || message.includes('401')) {
      invalidateNseCookie();
    }

    return NextResponse.json(
      { error: 'Failed to fetch LTP data from NSE.', details: message },
      { status: 502 },
    );
  }
}
