import 'dotenv/config';
import { prisma } from '../lib/db';

async function main() {
  const count = await prisma.optionChainBackup.count();
  console.log('Count:', count);
}
main().catch(console.error);
