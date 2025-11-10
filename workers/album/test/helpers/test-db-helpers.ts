/**
 * Helper utilities for test database operations
 */

import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';
import { MediaFixture, toPrismaCreate } from '../fixtures/media-fixtures';

/**
 * Creates a Prisma client for testing
 */
export function createTestPrismaClient(db: D1Database): PrismaClient {
  const adapter = new PrismaD1(db);
  return new PrismaClient({ adapter });
}

/**
 * Seeds the database with fixture data
 */
export async function seedDatabase(
  prisma: PrismaClient,
  fixtures: MediaFixture[]
): Promise<void> {
  for (const fixture of fixtures) {
    await prisma.media.create({
      data: toPrismaCreate(fixture),
    });
  }
}

/**
 * Seeds pending thumbnails for media
 */
export async function seedPendingThumbnails(
  prisma: PrismaClient,
  keys: string[]
): Promise<void> {
  for (const key of keys) {
    await prisma.pendingThumbnails.create({
      data: {
        key,
        createdAt: new Date(),
      },
    });
  }
}

/**
 * Cleans up test data by key prefix
 */
export async function cleanupTestData(
  db: D1Database,
  keyPrefix: string = 'test-'
): Promise<void> {
  await db.prepare(`DELETE FROM media WHERE key LIKE ?`).bind(`${keyPrefix}%`).run();
  await db.prepare(`DELETE FROM pending_thumbnails WHERE key LIKE ?`).bind(`${keyPrefix}%`).run();
}

/**
 * Cleans up specific test data by exact keys
 */
export async function cleanupByKeys(
  db: D1Database,
  keys: string[]
): Promise<void> {
  for (const key of keys) {
    await db.prepare(`DELETE FROM media WHERE key = ?`).bind(key).run();
    await db.prepare(`DELETE FROM pending_thumbnails WHERE key = ?`).bind(key).run();
  }
}

/**
 * Cleans up all test data
 */
export async function cleanupAllTestData(db: D1Database): Promise<void> {
  // Clean up common test prefixes
  const prefixes = ['test-', 'ceremony-', 'reception-', 'video-', 'processed-', 'minimal-'];
  for (const prefix of prefixes) {
    await cleanupTestData(db, prefix);
  }
}

/**
 * Verifies media exists in database
 */
export async function verifyMediaExists(
  prisma: PrismaClient,
  key: string
): Promise<boolean> {
  const media = await prisma.media.findUnique({
    where: { key },
  });
  return media !== null;
}

/**
 * Verifies pending thumbnail exists
 */
export async function verifyPendingThumbnailExists(
  prisma: PrismaClient,
  key: string
): Promise<boolean> {
  const pending = await prisma.pendingThumbnails.findUnique({
    where: { key },
  });
  return pending !== null;
}

/**
 * Gets media count by type
 */
export async function getMediaCountByType(
  prisma: PrismaClient,
  type: 'image' | 'video'
): Promise<number> {
  return await prisma.media.count({
    where: { type },
  });
}

/**
 * Gets media with specific camera
 */
export async function getMediaByCamera(
  prisma: PrismaClient,
  cameraMake: string,
  cameraModel: string
) {
  return await prisma.media.findMany({
    where: {
      cameraMake,
      cameraModel,
    },
  });
}

/**
 * Gets media within date range
 */
export async function getMediaInDateRange(
  prisma: PrismaClient,
  startDate: Date,
  endDate: Date
) {
  return await prisma.media.findMany({
    where: {
      dateTaken: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: {
      dateTaken: 'asc',
    },
  });
}

/**
 * Gets all pending thumbnails
 */
export async function getAllPendingThumbnails(prisma: PrismaClient) {
  return await prisma.pendingThumbnails.findMany({
    orderBy: {
      createdAt: 'asc',
    },
  });
}

/**
 * Mock R2 object for testing
 */
export interface MockR2Object {
  key: string;
  size: number;
  httpMetadata?: {
    contentType?: string;
  };
  customMetadata?: Record<string, string>;
}

/**
 * Creates a mock R2 bucket for testing
 */
export function createMockR2Bucket(storage: Map<string, MockR2Object> = new Map()) {
  return {
    async put(
      key: string,
      value: ReadableStream | ArrayBuffer | Blob | File | Uint8Array,
      options?: {
        httpMetadata?: { contentType?: string };
        customMetadata?: Record<string, string>;
      }
    ) {
      let size = 0;
      if (value instanceof Blob || value instanceof File) {
        size = value.size;
      } else if (value instanceof ArrayBuffer) {
        size = value.byteLength;
      } else if (value instanceof Uint8Array) {
        size = value.length;
      }

      storage.set(key, {
        key,
        size,
        httpMetadata: options?.httpMetadata,
        customMetadata: options?.customMetadata,
      });
      return null;
    },
    async get(key: string) {
      const obj = storage.get(key);
      if (!obj) return null;

      // Return a simplified R2Object-like structure
      return {
        key: obj.key,
        size: obj.size,
        body: new ReadableStream(),
        httpMetadata: obj.httpMetadata || {},
        httpEtag: `"${key}-etag"`,
        writeHttpMetadata: (headers: Headers) => {
          if (obj.httpMetadata?.contentType) {
            headers.set('Content-Type', obj.httpMetadata.contentType);
          }
        },
      };
    },
    async head(key: string) {
      const obj = storage.get(key);
      if (!obj) return null;

      return {
        key: obj.key,
        size: obj.size,
        httpMetadata: obj.httpMetadata || {},
        httpEtag: `"${key}-etag"`,
      };
    },
    async delete(key: string) {
      storage.delete(key);
    },
    async list(options?: { prefix?: string }) {
      const prefix = options?.prefix || '';
      const objects = Array.from(storage.values())
        .filter(obj => obj.key.startsWith(prefix))
        .map(obj => ({
          key: obj.key,
          size: obj.size,
        }));

      return {
        objects,
        truncated: false,
        cursor: undefined,
      };
    },
  };
}
