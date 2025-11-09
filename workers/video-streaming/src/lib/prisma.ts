import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";

/**
 * Creates a Prisma Client instance with D1 adapter for Cloudflare Workers
 * @param d1Database - The D1Database binding from Cloudflare Workers
 * @returns PrismaClient instance configured for D1
 */
export function createPrismaClient(d1Database: D1Database): PrismaClient {
  const adapter = new PrismaD1(d1Database);
  return new PrismaClient({ adapter });
}
