import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.POSTGRES_URL_NON_POOLING?.replace('?sslmode=require', '');

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

let prismaInstance: PrismaClient | null = null;

if (connectionString) {
  try {
    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
    const adapter = new PrismaPg(pool);

    prismaInstance =
      globalForPrisma.prisma ??
      new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      });

    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prismaInstance;
  } catch (err) {
    console.warn('[db] Failed to initialize Prisma client:', err);
  }
} else {
  console.warn(
    '[db] POSTGRES_URL_NON_POOLING environment variable is missing. ' +
    'Database fallback features will be disabled until configured in .env.local or Vercel.'
  );
}

// Proxy wrapper to prevent crashes when POSTGRES_URL_NON_POOLING is not set
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    if (!prismaInstance) {
      // Return dummy async functions for prisma model methods when DB is unconfigured
      return new Proxy({}, {
        get() {
          return async () => null;
        },
      });
    }
    return (prismaInstance as any)[prop];
  },
});
