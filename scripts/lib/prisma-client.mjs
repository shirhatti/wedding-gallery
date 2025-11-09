/**
 * Prisma Client factory for Node.js scripts
 *
 * This module provides Prisma client for maintenance scripts.
 * Uses the DATABASE_URL from .env file to connect to local SQLite database.
 */

import { PrismaClient } from '@prisma/client';

/**
 * Create Prisma Client for local development
 * Uses the DATABASE_URL from .env file (file:./prisma/dev.db)
 */
export function createLocalPrismaClient() {
  return new PrismaClient({
    log: process.env.DEBUG ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
  });
}

/**
 * Batch update helper for collecting Prisma operations
 * Useful for scripts that need to perform many updates
 */
export class PrismaBatchUpdater {
  constructor(prisma) {
    this.prisma = prisma;
    this.operations = [];
  }

  /**
   * Add a Prisma operation to the batch
   * @param {Function} operation - Function that returns a Prisma operation
   */
  add(operation) {
    this.operations.push(operation);
  }

  /**
   * Execute all batched operations in a transaction
   */
  async execute() {
    console.log(`Executing ${this.operations.length} operations in transaction...`);

    await this.prisma.$transaction(async (tx) => {
      const results = [];
      for (const op of this.operations) {
        const result = await op(tx);
        results.push(result);
      }
      return results;
    });

    console.log('✓ Transaction completed');
    this.clear();
  }

  /**
   * Clear all batched operations
   */
  clear() {
    this.operations = [];
  }

  /**
   * Get count of batched operations
   */
  get count() {
    return this.operations.length;
  }
}

/**
 * Convert Date to ISO string format for database
 */
export function toISOString(date = new Date()) {
  return date.toISOString();
}

/**
 * Normalize metadata value for database storage
 */
export function normalizeValue(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return null;
  return val;
}

