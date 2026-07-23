const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBackups() {
  const backups = await prisma.optionChainBackup.findMany({
    select: {
      id: true,
      timestamp: true,
      expiry: true,
    },
    orderBy: { timestamp: 'desc' },
    take: 10
  });
  console.log('Recent 10 backups:');
  console.table(backups);
  
  const uniqueExpiries = await prisma.optionChainBackup.groupBy({
    by: ['expiry'],
    _count: { expiry: true }
  });
  console.log('\nUnique expiries in DB:');
  console.table(uniqueExpiries);
}

checkBackups()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
