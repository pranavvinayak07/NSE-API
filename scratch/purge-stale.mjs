import pg from 'pg';
const pool = new pg.Pool({
  connectionString: 'postgres://postgres.svqxhkfzznqbayhhmovj:DVVPa3tAReXsRC1V@aws-1-ap-south-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false },
});
const r = await pool.query(`DELETE FROM "OptionChainBackup" WHERE timestamp >= '2026-06-06'`);
console.log('Deleted', r.rowCount, 'stale backup rows');
await pool.end();
