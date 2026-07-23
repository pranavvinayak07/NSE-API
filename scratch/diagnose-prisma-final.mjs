/**
 * Final test: Use actual Prisma client to call createMany 
 * with the exact same data shape as cron backup.
 */
import { readFileSync } from 'fs';

// Load .env manually
const envContent = readFileSync('.env', 'utf8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim().replace(/\r$/, '');
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  let val = trimmed.slice(eqIdx + 1);
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  if (!process.env[key]) process.env[key] = val;
}

// Import Prisma
const { PrismaClient } = await import('@prisma/client');
const { PrismaPg } = await import('@prisma/adapter-pg');
const pg = await import('pg');

const connectionString = process.env.POSTGRES_URL_NON_POOLING.replace('?sslmode=require', '');
const pool = new pg.default.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('=== FINAL TEST: Prisma createMany with exact cron data ===\n');

  // Get latest backup
  const latestBackup = await prisma.optionChainBackup.findFirst({
    orderBy: { timestamp: 'desc' },
  });

  if (!latestBackup) {
    console.log('No backups found');
    return;
  }

  const enrichedRows = latestBackup.data;
  const spot = latestBackup.underlyingValue;
  const atmStrike = latestBackup.atmStrike;
  const expiry = latestBackup.expiry;

  // Use a test timestamp to avoid conflicts
  const testTimestamp = new Date('2000-01-05T00:00:00Z');

  const mappedData = enrichedRows.map((row) => ({
    timestamp:  testTimestamp,
    expiry:     'TEST-PRISMA-CREATEMANY',
    strike:     row.strike,
    ceHigh:     row.ceHigh     ?? undefined,
    ceLow:      row.ceLow      ?? undefined,
    ceLTP:      row.ceLTP      ?? undefined,
    ceOI:       row.ceS        ?? undefined,
    peHigh:     row.peHigh     ?? undefined,
    peLow:      row.peLow      ?? undefined,
    peLTP:      row.peLTP      ?? undefined,
    peOI:       row.peS        ?? undefined,
    difference: row.difference ?? undefined,
    average:    row.average    ?? undefined,
    spot:       spot           ?? undefined,
    atmStrike:  atmStrike      ?? undefined,
  }));

  console.log(`Attempting createMany with ${mappedData.length} rows...`);
  console.log(`First row:`, JSON.stringify(mappedData[0], (k, v) => v === undefined ? '__UNDEFINED__' : v, 2));

  try {
    const result = await prisma.optionSnapshot.createMany({
      data: mappedData,
      skipDuplicates: true,
    });
    console.log(`\n✅ createMany returned:`, result);
    console.log(`   count: ${result.count}`);
  } catch (err) {
    console.log(`\n❌ createMany THREW:`);
    console.log(`   name: ${err.name}`);
    console.log(`   message: ${err.message}`);
    if (err.code) console.log(`   code: ${err.code}`);
    if (err.meta) console.log(`   meta:`, JSON.stringify(err.meta));
  }

  // Verify
  const count = await prisma.optionSnapshot.count({
    where: { expiry: 'TEST-PRISMA-CREATEMANY' }
  });
  console.log(`\nVerification: ${count} rows in DB with test expiry`);

  // Clean up
  if (count > 0) {
    await prisma.optionSnapshot.deleteMany({
      where: { expiry: 'TEST-PRISMA-CREATEMANY' }
    });
    console.log('Cleaned up test rows');
  }

  await prisma.$disconnect();
  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
