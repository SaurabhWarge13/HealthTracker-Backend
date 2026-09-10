import { PrismaClient } from '@prisma/client';

// One shared client for the process — extra instances open redundant
// connection pools. The global cache stops ts-node-dev hot reloads stacking up
// a new client on every restart.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
