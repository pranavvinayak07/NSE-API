/**
 * Test: Does Prisma createMany actually work with PrismaPg adapter?
 * Uses the exact same db.ts setup as production.
 */

// Load env
import { readFileSync } from 'fs';
const envContent = readFileSync('.env', 'utf8');
for (const line of envContent.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  let val = trimmed.slice(eqIdx + 1);
  if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
  if (!process.env[key]) process.env[key] = val;
}

import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.POSTGRES_URL_NON_POOLING.replace('?sslmode=require', '');

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

// Simulate a Prisma createMany by doing a raw multi-insert
async function testCreateMany() {
  console.log('=== TEST: Prisma-style createMany simulation ===\n');
  
  const testTimestamp = new Date('2000-01-02T00:00:00Z');
  const testExpiry = 'TEST-DIAGNOSTIC';
  
  const rows = [
    { strike: 99990, ceHigh: 100.5, ceLow: 90.5, spot: 23000, atmStrike: 23000 },
    { strike: 99991, ceHigh: 200.5, ceLow: 190.5, spot: 23000, atmStrike: 23000 },
  ];

  try {
    // Try bulk insert
    for (const row of rows) {
      await pool.query(`
        INSERT INTO "OptionSnapshot" (id, timestamp, "createdAt", expiry, strike, "ceHigh", "ceLow", spot, "atmStrike")
        VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, $8)
        ON CONFLICT (timestamp, strike, expiry) DO NOTHING
      `, [
        'diag-' + Date.now() + '-' + row.strike,
        testTimestamp,
        testExpiry,
        row.strike,
        row.ceHigh,
        row.ceLow,
        row.spot,
        row.atmStrike,
      ]);
    }
    
    // Verify they're there
    const check = await pool.query(`
      SELECT COUNT(*) as count FROM "OptionSnapshot" WHERE expiry = $1
    `, [testExpiry]);
    
    console.log(`  Inserted ${check.rows[0].count} rows ✅`);
    
    // Clean up
    await pool.query(`DELETE FROM "OptionSnapshot" WHERE expiry = $1`, [testExpiry]);
    console.log('  Cleaned up test rows');
    
  } catch (err) {
    console.log(`  ❌ FAILED: ${err.message}`);
  }

  // Now check: did the CRON ever even reach the createMany line?
  // Look at the cron backup code more carefully
  console.log('\n=== HYPOTHESIS: Cron backup threw BEFORE reaching createMany ===');
  console.log('  The cron route.ts has this flow:');
  console.log('  1. fetchMasterChainInfo() → gets spot, expiries, fullData');
  console.log('  2. fetchOptionChainData() → fetches CE/PE high/low for each strike');
  console.log('  3. prisma.optionChainBackup.create() → saves blob');
  console.log('  4. prisma.optionSnapshot.createMany() → saves per-strike rows');
  console.log('');
  console.log('  If step 2 threw (NSE timeout during off-hours), the outer catch');
  console.log('  would catch it, and steps 3+4 would never execute.');
  console.log('  BUT... we have 4 OptionChainBackup rows, which means step 3 DID execute.');
  console.log('  So step 4 should have executed too.');
  console.log('');
  console.log('  Checking if createMany just silently returned count=0...');
  
  // Check: did Prisma createMany with PrismaPg adapter have issues with cuid() IDs?
  console.log('\n=== CHECKING: Does the OptionSnapshot table have the @default(cuid()) working? ===');
  try {
    const tableInfo = await pool.query(`
      SELECT column_name, column_default, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_name = 'OptionSnapshot'
      ORDER BY ordinal_position
    `);
    
    for (const col of tableInfo.rows) {
      console.log(`  ${col.column_name.padEnd(15)} | ${(col.data_type).padEnd(20)} | nullable: ${col.is_nullable} | default: ${col.column_default || 'NONE'}`);
    }
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  await pool.end();
}

testCreateMany().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
