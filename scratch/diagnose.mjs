/**
 * Diagnostic script: Query OptionChainBackup and test live NSE fetch
 * Run: node scratch/diagnose.mjs
 */
import pg from 'pg';
const { Pool } = pg;

const connectionString = process.env.POSTGRES_URL_NON_POOLING?.replace('?sslmode=require', '')
  || 'postgres://postgres.svqxhkfzznqbayhhmovj:DVVPa3tAReXsRC1V@aws-1-ap-south-1.pooler.supabase.com:5432/postgres';

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log('=== DIAGNOSTIC: Querying OptionChainBackup ===\n');

  try {
    // 1. Check latest 20 backups
    const backups = await pool.query(`
      SELECT id, timestamp, "underlyingValue", "atmStrike", expiry, 
             json_array_length(data::text::json) as row_count
      FROM "OptionChainBackup"
      ORDER BY timestamp DESC
      LIMIT 20
    `);

    if (backups.rows.length === 0) {
      console.log('❌ NO BACKUPS FOUND IN DATABASE');
    } else {
      console.log(`Found ${backups.rows.length} backups:\n`);
      console.log('Timestamp                    | Spot       | ATM    | Expiry         | Rows');
      console.log('-'.repeat(90));
      for (const row of backups.rows) {
        const ts = new Date(row.timestamp).toISOString().replace('T', ' ').slice(0, 19);
        console.log(
          `${ts} | ${String(row.underlyingValue).padEnd(10)} | ${String(row.atmStrike).padEnd(6)} | ${String(row.expiry).padEnd(14)} | ${row.row_count}`
        );
      }
    }

    // 2. Check distinct expiry values in backups
    console.log('\n=== DISTINCT EXPIRIES IN BACKUPS ===');
    const expiries = await pool.query(`
      SELECT DISTINCT expiry, COUNT(*) as count
      FROM "OptionChainBackup"
      GROUP BY expiry
      ORDER BY count DESC
    `);
    for (const row of expiries.rows) {
      console.log(`  ${row.expiry} (${row.count} backups)`);
    }

    // 3. Check distinct spots to see variance
    console.log('\n=== SPOT PRICE VARIANCE (Last 20) ===');
    const spots = await pool.query(`
      SELECT "underlyingValue", COUNT(*) as count
      FROM "OptionChainBackup"
      WHERE timestamp > NOW() - INTERVAL '7 days'
      GROUP BY "underlyingValue"
      ORDER BY count DESC
      LIMIT 10
    `);
    if (spots.rows.length === 0) {
      console.log('  No backups in last 7 days');
    } else {
      for (const row of spots.rows) {
        console.log(`  Spot: ${row.underlyingValue} (appeared ${row.count} times)`);
      }
    }

    // 4. Check OptionSnapshot count
    console.log('\n=== OPTION SNAPSHOTS ===');
    const snapCount = await pool.query(`SELECT COUNT(*) as count FROM "OptionSnapshot"`);
    console.log(`  Total snapshots: ${snapCount.rows[0].count}`);

    const latestSnap = await pool.query(`
      SELECT timestamp, strike, spot, "atmStrike", expiry
      FROM "OptionSnapshot"
      ORDER BY timestamp DESC
      LIMIT 5
    `);
    if (latestSnap.rows.length > 0) {
      console.log('  Latest 5 snapshots:');
      for (const row of latestSnap.rows) {
        const ts = new Date(row.timestamp).toISOString().replace('T', ' ').slice(0, 19);
        console.log(`    ${ts} | Strike: ${row.strike} | Spot: ${row.spot} | ATM: ${row.atmStrike} | Expiry: ${row.expiry}`);
      }
    }

  } catch (err) {
    console.error('Database query failed:', err.message);
  } finally {
    await pool.end();
  }

  // 5. Test live NSE fetch
  console.log('\n=== TESTING LIVE NSE FETCH ===');
  try {
    const { NSE } = await import('nse-bse-api');
    const nse = new NSE('/tmp/nse-test', { server: true });
    console.log('  Calling nse.optionChain("NIFTY")...');
    const data = await nse.optionChain('NIFTY');
    
    if (data?.records?.data) {
      console.log(`  ✅ Live fetch SUCCESS`);
      console.log(`  Spot (underlyingValue): ${data.records.underlyingValue}`);
      console.log(`  Timestamp: ${data.records.timestamp}`);
      console.log(`  Expiry dates: ${data.records.expiryDates?.slice(0, 5).join(', ')}...`);
      console.log(`  Total strikes: ${data.records.data.length}`);
      console.log(`  Strike prices: ${data.records.strikePrices?.slice(0, 5).join(', ')}...`);
    } else {
      console.log(`  ❌ Live fetch returned empty/invalid data`);
      console.log(`  Raw keys:`, Object.keys(data || {}));
    }
  } catch (err) {
    console.log(`  ❌ Live fetch FAILED: ${err.message}`);
  }
}

main();
