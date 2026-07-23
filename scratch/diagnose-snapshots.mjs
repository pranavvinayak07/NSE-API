/**
 * Diagnostic: Reproduce the exact cron backup flow for OptionSnapshot
 * to prove WHY 0 rows exist.
 * 
 * Checks:
 * 1. Does enrichedRows.map() produce an empty array?
 * 2. Does skipDuplicates + unique constraint reject everything?
 * 3. Does undefined vs null cause Prisma rejection?
 * 4. Does createMany throw (swallowed by outer catch)?
 */
import pg from 'pg';
const { Pool } = pg;

const connectionString = 'postgres://postgres.svqxhkfzznqbayhhmovj:DVVPa3tAReXsRC1V@aws-1-ap-south-1.pooler.supabase.com:5432/postgres';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log('=== DIAGNOSING WHY OptionSnapshot HAS 0 ROWS ===\n');

  // Step 1: Get the latest backup to reproduce the exact input
  const backupResult = await pool.query(`
    SELECT id, timestamp, "underlyingValue", "atmStrike", expiry, data
    FROM "OptionChainBackup"
    ORDER BY timestamp DESC
    LIMIT 1
  `);

  if (backupResult.rows.length === 0) {
    console.log('❌ No backups found, cannot reproduce');
    await pool.end();
    return;
  }

  const backup = backupResult.rows[0];
  const dataRows = backup.data;
  
  console.log(`Backup ID: ${backup.id}`);
  console.log(`Backup timestamp: ${backup.timestamp}`);
  console.log(`Backup spot: ${backup.underlyingValue}`);
  console.log(`Backup ATM: ${backup.atmStrike}`);
  console.log(`Backup expiry: ${backup.expiry}`);
  console.log(`Data rows count: ${Array.isArray(dataRows) ? dataRows.length : 'NOT AN ARRAY'}`);
  console.log();

  if (!Array.isArray(dataRows) || dataRows.length === 0) {
    console.log('❌ CHECK #1 FAILED: data is empty or not an array → map() returns empty');
    await pool.end();
    return;
  }

  // Step 2: Reproduce the exact .map() from cron backup route
  console.log('=== CHECK #1: Does enrichedRows.map() produce valid data? ===');
  const spot = backup.underlyingValue;
  const atmStrike = backup.atmStrike;
  const expiry = backup.expiry;
  const snapshotTime = new Date(backup.timestamp);

  const mappedData = dataRows.map((row) => ({
    timestamp:  snapshotTime,
    expiry,
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

  console.log(`  Mapped rows count: ${mappedData.length}`);
  console.log(`  First mapped row:`, JSON.stringify(mappedData[0], null, 2));
  console.log();

  // Check for undefined values
  console.log('=== CHECK #2: Are there undefined values? ===');
  const firstRow = mappedData[0];
  const undefinedFields = Object.entries(firstRow)
    .filter(([, v]) => v === undefined)
    .map(([k]) => k);
  
  if (undefinedFields.length > 0) {
    console.log(`  ⚠️ Fields with undefined: ${undefinedFields.join(', ')}`);
    console.log(`  Prisma may skip or reject these fields`);
  } else {
    console.log(`  ✅ No undefined fields`);
  }
  console.log();

  // Step 3: Check for existing rows that would trigger skipDuplicates
  console.log('=== CHECK #3: Are there existing rows with same unique key? ===');
  const existingCheck = await pool.query(`
    SELECT COUNT(*) as count 
    FROM "OptionSnapshot" 
    WHERE timestamp = $1 AND expiry = $2
  `, [snapshotTime, expiry]);
  console.log(`  Existing rows for (${snapshotTime.toISOString()}, ${expiry}): ${existingCheck.rows[0].count}`);
  console.log();

  // Step 4: Actually try to insert ONE row with the exact same shape
  console.log('=== CHECK #4: Try inserting ONE row with undefined values ===');
  const testRow = mappedData[0];
  // Use a unique timestamp so we don't conflict
  const testTimestamp = new Date('2000-01-01T00:00:00Z');
  
  try {
    // Simulate what Prisma createMany does - build an INSERT
    const columns = ['timestamp', 'expiry', 'strike', 'id'];
    const values = [testTimestamp, expiry, testRow.strike, 'test-diagnostic-' + Date.now()];
    
    // Add nullable fields - use NULL for undefined
    const nullableFields = ['ceHigh', 'ceLow', 'ceLTP', 'ceOI', 'peHigh', 'peLow', 'peLTP', 'peOI', 'difference', 'average', 'spot', 'atmStrike'];
    for (const field of nullableFields) {
      columns.push(`"${field}"`);
      const val = testRow[field];
      values.push(val === undefined ? null : val);
    }

    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
    const sql = `INSERT INTO "OptionSnapshot" (${columns.map(c => c.startsWith('"') ? c : `"${c}"`).join(', ')}) VALUES (${placeholders})`;
    
    await pool.query(sql, values);
    console.log('  ✅ Direct INSERT succeeded');
    
    // Clean up
    await pool.query(`DELETE FROM "OptionSnapshot" WHERE "timestamp" = $1`, [testTimestamp]);
    console.log('  (cleaned up test row)');
  } catch (err) {
    console.log(`  ❌ Direct INSERT FAILED: ${err.message}`);
  }
  console.log();

  // Step 5: Check the actual data values to understand if ceS/peS exist in backup data
  console.log('=== CHECK #5: Inspect actual backup row field presence ===');
  const sampleRow = dataRows[Math.floor(dataRows.length / 2)]; // Middle row
  console.log(`  Sample row keys: ${Object.keys(sampleRow).join(', ')}`);
  console.log(`  Sample row values:`);
  for (const [k, v] of Object.entries(sampleRow)) {
    console.log(`    ${k}: ${JSON.stringify(v)} (type: ${typeof v})`);
  }

  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
