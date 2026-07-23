import 'dotenv/config';
import { prisma } from '../lib/db';

async function main() {
  try {
    const backups = await prisma.optionChainBackup.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5
    });
    console.log(`Found ${backups.length} backups in the database.`);
    if (backups.length > 0) {
      console.log('Latest backup details:');
      console.log(`ID: ${backups[0].id}`);
      console.log(`Timestamp: ${backups[0].timestamp}`);
      console.log(`Underlying Value: ${backups[0].underlyingValue}`);
      console.log(`ATM Strike: ${backups[0].atmStrike}`);
      console.log(`Expiry: ${backups[0].expiry}`);
      // Not printing the full `data` JSON to keep output readable
      console.log(`Data rows count: ${(backups[0].data as any[])?.length || 0}`);
    }
  } catch (error) {
    console.error('Error fetching data:', error);
  } finally {
    // Note: since it's an edge/serverless setup using connection pooling, 
    // disconnecting is generally good practice in standalone scripts.
    await prisma.$disconnect();
  }
}

main();
