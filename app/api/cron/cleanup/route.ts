import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Parses an NSE expiry string like "16-Jun-2026" → Date (midnight IST).
 */
const MONTH_MAP: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

function parseNseExpiry(exp: string): Date | null {
  const parts = exp.split('-');
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = MONTH_MAP[parts[1]];
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || month === undefined || isNaN(year)) return null;
  // Expiry is valid through end of that calendar day in IST (UTC+5:30)
  // Add 1 day so we delete only fully-expired contracts
  return new Date(Date.UTC(year, month, day + 1, 0, 0, 0) - 5.5 * 60 * 60 * 1000);
}

/**
 * GET /api/cron/cleanup
 *
 * Dedicated route for pruning old database records.
 * Runs two cleanup passes:
 *   1. Delete records where the expiry contract date is now in the past.
 *   2. Delete records older than 90 days (safety net).
 *
 * Can be scheduled via Vercel Cron (once daily is fine).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  // Check if called from Vercel Cron
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const now = new Date();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const distinctExpiries = await prisma.optionChainBackup.findMany({
      distinct: ['expiry'],
      select: { expiry: true },
    });

    const expiredExpiries: string[] = ((distinctExpiries as any[]) ?? [])
      .map((r: any) => r.expiry)
      .filter((exp: any): exp is string => {
        if (!exp) return false;
        const expDate = parseNseExpiry(exp);
        return expDate !== null && expDate < now;
      });

    let pastExpirySnapshots = 0;
    let pastExpiryBackups = 0;

    if (expiredExpiries.length > 0) {
      console.log(`[cron-cleanup] Deleting data for expired contracts: ${expiredExpiries.join(', ')}`);

      const [snapRes, backupRes] = await Promise.all([
        prisma.optionSnapshot.deleteMany({
          where: { expiry: { in: expiredExpiries } },
        }),
        prisma.optionChainBackup.deleteMany({
          where: { expiry: { in: expiredExpiries } },
        }),
      ]);
      pastExpirySnapshots = snapRes.count;
      pastExpiryBackups = backupRes.count;
    }

    // ── Pass 2: Delete records older than 90 days (safety net) ──────────────
    const [snapshotResult, backupResult] = await Promise.all([
      prisma.optionSnapshot.deleteMany({
        where: { timestamp: { lt: ninetyDaysAgo } },
      }),
      prisma.optionChainBackup.deleteMany({
        where: { timestamp: { lt: ninetyDaysAgo } },
      }),
    ]);

    console.log(
      `[cron-cleanup] Past-expiry: ${pastExpirySnapshots} snapshots + ${pastExpiryBackups} backups deleted.`,
    );
    console.log(
      `[cron-cleanup] 90-day prune: ${snapshotResult.count} snapshots + ${backupResult.count} backups deleted.`,
    );

    return NextResponse.json({
      success: true,
      message: 'Cleanup completed successfully',
      expiredContracts: expiredExpiries,
      pastExpirySnapshots,
      pastExpiryBackups,
      prunedSnapshots: snapshotResult.count,
      prunedBackups: backupResult.count,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error occurred';
    console.error('[cron-cleanup] FAILED:', message);
    return NextResponse.json(
      { error: 'Failed to prune database.', details: message },
      { status: 500 },
    );
  }
}

