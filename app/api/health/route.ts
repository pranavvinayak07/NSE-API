import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { isMarketOpenIST } from '@/lib/market-hours';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const marketOpen = isMarketOpenIST();

    // Fetch the latest backup age
    const latestBackup = await prisma.optionChainBackup.findFirst({
      orderBy: { timestamp: 'desc' },
      select: { timestamp: true },
    });

    let lastBackupAgeMinutes = -1;
    if (latestBackup) {
      lastBackupAgeMinutes = (Date.now() - latestBackup.timestamp.getTime()) / 60000;
    }

    // ── Database Verification ─────────────────────────────────────────────
    let databaseAlive = false;
    try {
      await prisma.$queryRaw`SELECT 1`;
      databaseAlive = true;
    } catch (dbErr) {
      console.error('[health] Database verification failed:', dbErr);
    }

    // Fast check to ensure OptionSnapshot table is accessible
    let snapshotAccessible = false;
    try {
      await prisma.optionSnapshot.count();
      snapshotAccessible = true;
    } catch (snapErr) {
      console.error('[health] OptionSnapshot access failed:', snapErr);
    }

    // Evaluate Backup Health
    // During market hours, backups should be fresh (< 15 mins).
    // Outside market hours, the backup age doesn't indicate an outage.
    const backupHealthy = lastBackupAgeMinutes >= 0 && 
      (marketOpen ? lastBackupAgeMinutes < 15 : true);

    return NextResponse.json({
      status: 'ok',
      database: databaseAlive,
      marketOpen,
      backupHealthy,
      lastBackupAgeMinutes: lastBackupAgeMinutes > -1 ? Math.round(lastBackupAgeMinutes) : null,
      snapshotAccessible,
      scheduler: 'cron-job.org',
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || 'local',
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      status: 'error',
      message,
    }, { status: 500 });
  }
}
