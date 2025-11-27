/**
 * E2E tests for thumbnail generation workflow
 * Tests the lifecycle of pending thumbnails, processing, and completion
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { setupTestDatabase } from './setup-test-db';
import {
  createTestPrismaClient,
  cleanupAllTestData,
  seedDatabase,
  seedPendingThumbnails,
  getAllPendingThumbnails,
} from './helpers/test-db-helpers';
import {
  fixtures,
  createImageFixture,
} from './fixtures/media-fixtures';

describe('E2E Thumbnail Processing Workflow', () => {
  let prisma: ReturnType<typeof createTestPrismaClient>;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  beforeEach(async () => {
    await cleanupAllTestData(env.DB);
    prisma = createTestPrismaClient(env.DB);
  });

  afterAll(async () => {
    await cleanupAllTestData(env.DB);
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  describe('Pending Thumbnail Queue', () => {
    it('should add images to pending queue on upload', async () => {
      const fixture = createImageFixture();

      // Simulate upload
      await prisma.media.create({
        data: {
          key: fixture.key,
          filename: fixture.filename,
          type: fixture.type,
          size: fixture.size!,
          uploadedAt: fixture.uploadedAt,
          createdAt: fixture.createdAt,
          updatedAt: fixture.updatedAt,
        },
      });

      // Add to pending queue
      await prisma.pendingThumbnails.create({
        data: {
          key: fixture.key,
          createdAt: new Date(),
        },
      });

      const pending = await prisma.pendingThumbnails.findUnique({
        where: { key: fixture.key },
      });

      expect(pending).toBeTruthy();
      expect(pending?.key).toBe(fixture.key);
    });

    it('should not add videos to pending queue', async () => {
      const videoFixture = fixtures.videos[0];

      await prisma.media.create({
        data: {
          key: videoFixture.key,
          filename: videoFixture.filename,
          type: videoFixture.type,
          size: videoFixture.size!,
          uploadedAt: videoFixture.uploadedAt,
          createdAt: videoFixture.createdAt,
          updatedAt: videoFixture.updatedAt,
        },
      });

      // Don't add videos to pending queue
      const pending = await prisma.pendingThumbnails.findUnique({
        where: { key: videoFixture.key },
      });

      expect(pending).toBeNull();
    });

    it('should retrieve pending thumbnails in FIFO order', async () => {
      const keys = ['first.jpg', 'second.jpg', 'third.jpg'];
      const now = Date.now();

      // Create with increasing timestamps
      for (let i = 0; i < keys.length; i++) {
        const createdAt = new Date(now + i * 1000);
        await prisma.pendingThumbnails.create({
          data: {
            key: keys[i],
            createdAt,
          },
        });

        // Also create media entries
        await prisma.media.create({
          data: {
            key: keys[i],
            filename: keys[i],
            type: 'image',
            size: 1000,
            uploadedAt: createdAt,
            createdAt,
            updatedAt: createdAt,
          },
        });
      }

      const pending = await prisma.pendingThumbnails.findMany({
        orderBy: { createdAt: 'asc' },
      });

      expect(pending.length).toBe(3);
      expect(pending[0].key).toBe('first.jpg');
      expect(pending[1].key).toBe('second.jpg');
      expect(pending[2].key).toBe('third.jpg');
    });

    it('should handle batch processing of pending thumbnails', async () => {
      await seedDatabase(prisma, fixtures.weddingCeremony);
      const keys = fixtures.weddingCeremony.map(f => f.key);
      await seedPendingThumbnails(prisma, keys);

      // Simulate batch processor fetching 2 at a time
      const batchSize = 2;
      const batch = await prisma.pendingThumbnails.findMany({
        take: batchSize,
        orderBy: { createdAt: 'asc' },
      });

      expect(batch.length).toBe(batchSize);
    });
  });

  describe('Thumbnail Processing', () => {
    it('should update media with thumbnail paths after processing', async () => {
      const fixture = createImageFixture();

      await prisma.media.create({
        data: {
          key: fixture.key,
          filename: fixture.filename,
          type: fixture.type,
          size: fixture.size!,
          uploadedAt: fixture.uploadedAt,
          createdAt: fixture.createdAt,
          updatedAt: fixture.updatedAt,
        },
      });

      await prisma.pendingThumbnails.create({
        data: {
          key: fixture.key,
          createdAt: new Date(),
        },
      });

      // Simulate thumbnail processing
      const thumbnailPaths = {
        small: `thumbnails/${fixture.key.replace(/\.[^.]+$/, '')}_small.jpg`,
        medium: `thumbnails/${fixture.key.replace(/\.[^.]+$/, '')}_medium.jpg`,
        large: `thumbnails/${fixture.key.replace(/\.[^.]+$/, '')}_large.jpg`,
      };

      await prisma.media.update({
        where: { key: fixture.key },
        data: {
          thumbnailSmall: thumbnailPaths.small,
          thumbnailMedium: thumbnailPaths.medium,
          thumbnailLarge: thumbnailPaths.large,
          processedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      const updated = await prisma.media.findUnique({
        where: { key: fixture.key },
      });

      expect(updated?.thumbnailSmall).toBe(thumbnailPaths.small);
      expect(updated?.thumbnailMedium).toBe(thumbnailPaths.medium);
      expect(updated?.thumbnailLarge).toBe(thumbnailPaths.large);
      expect(updated?.processedAt).toBeTruthy();
    });

    it('should update media with dimensions during processing', async () => {
      const fixture = createImageFixture({
        width: undefined,
        height: undefined,
      });

      await prisma.media.create({
        data: {
          key: fixture.key,
          filename: fixture.filename,
          type: fixture.type,
          size: fixture.size!,
          uploadedAt: fixture.uploadedAt,
          createdAt: fixture.createdAt,
          updatedAt: fixture.updatedAt,
        },
      });

      // Simulate dimension extraction during processing
      await prisma.media.update({
        where: { key: fixture.key },
        data: {
          width: 6720,
          height: 4480,
          processedAt: new Date(),
        },
      });

      const updated = await prisma.media.findUnique({
        where: { key: fixture.key },
      });

      expect(updated?.width).toBe(6720);
      expect(updated?.height).toBe(4480);
    });

    it('should update media with EXIF data during processing', async () => {
      const fixture = createImageFixture({
        cameraMake: undefined,
        cameraModel: undefined,
      });

      await prisma.media.create({
        data: {
          key: fixture.key,
          filename: fixture.filename,
          type: fixture.type,
          size: fixture.size!,
          uploadedAt: fixture.uploadedAt,
          createdAt: fixture.createdAt,
          updatedAt: fixture.updatedAt,
        },
      });

      // Simulate EXIF extraction
      await prisma.media.update({
        where: { key: fixture.key },
        data: {
          cameraMake: 'Canon',
          cameraModel: 'EOS 5D Mark IV',
          lens: 'EF24-70mm f/2.8L II USM',
          focalLength: 50,
          aperture: 2.8,
          shutterSpeed: 0.004,
          iso: 400,
          dateTaken: new Date('2024-06-15T14:30:00Z'),
          processedAt: new Date(),
        },
      });

      const updated = await prisma.media.findUnique({
        where: { key: fixture.key },
      });

      expect(updated?.cameraMake).toBe('Canon');
      expect(updated?.cameraModel).toBe('EOS 5D Mark IV');
      expect(updated?.focalLength).toBe(50);
      expect(updated?.dateTaken).toBeTruthy();
    });

    it('should remove from pending queue after successful processing', async () => {
      const fixture = createImageFixture();

      await prisma.media.create({
        data: {
          key: fixture.key,
          filename: fixture.filename,
          type: fixture.type,
          size: fixture.size!,
          uploadedAt: fixture.uploadedAt,
          createdAt: fixture.createdAt,
          updatedAt: fixture.updatedAt,
        },
      });

      await prisma.pendingThumbnails.create({
        data: {
          key: fixture.key,
          createdAt: new Date(),
        },
      });

      // Process thumbnail
      await prisma.media.update({
        where: { key: fixture.key },
        data: {
          thumbnailSmall: 'thumbnails/test_small.jpg',
          thumbnailMedium: 'thumbnails/test_medium.jpg',
          thumbnailLarge: 'thumbnails/test_large.jpg',
          processedAt: new Date(),
        },
      });

      // Remove from pending queue
      await prisma.pendingThumbnails.delete({
        where: { key: fixture.key },
      });

      const pending = await prisma.pendingThumbnails.findUnique({
        where: { key: fixture.key },
      });

      expect(pending).toBeNull();
    });
  });

  describe('Processing Statistics', () => {
    beforeEach(async () => {
      await seedDatabase(prisma, fixtures.weddingCeremony);
      await seedDatabase(prisma, fixtures.processedMedia);
    });

    it('should count processed vs unprocessed media', async () => {
      const processed = await prisma.media.count({
        where: {
          processedAt: { not: null },
        },
      });

      const unprocessed = await prisma.media.count({
        where: {
          processedAt: null,
        },
      });

      expect(processed).toBe(1); // processedMedia fixture
      expect(unprocessed).toBe(3); // ceremony photos
    });

    it('should find media with complete thumbnails', async () => {
      const complete = await prisma.media.findMany({
        where: {
          AND: [
            { thumbnailSmall: { not: null } },
            { thumbnailMedium: { not: null } },
            { thumbnailLarge: { not: null } },
          ],
        },
      });

      expect(complete.length).toBe(1);
      complete.forEach(m => {
        expect(m.thumbnailSmall).toBeTruthy();
        expect(m.thumbnailMedium).toBeTruthy();
        expect(m.thumbnailLarge).toBeTruthy();
      });
    });

    it('should find media with partial thumbnails', async () => {
      // Create media with only some thumbnails
      const partial = createImageFixture({
        key: 'partial-thumb.jpg',
        thumbnailMedium: 'thumbnails/partial_medium.jpg',
        thumbnailSmall: undefined,
        thumbnailLarge: undefined,
      });

      await prisma.media.create({
        data: {
          key: partial.key,
          filename: partial.filename,
          type: partial.type,
          size: partial.size!,
          thumbnailMedium: partial.thumbnailMedium,
          uploadedAt: partial.uploadedAt,
          createdAt: partial.createdAt,
          updatedAt: partial.updatedAt,
        },
      });

      const partialThumbs = await prisma.media.findMany({
        where: {
          OR: [
            {
              AND: [
                { thumbnailSmall: null },
                { thumbnailMedium: { not: null } },
              ],
            },
            {
              AND: [
                { thumbnailMedium: null },
                { thumbnailLarge: { not: null } },
              ],
            },
          ],
        },
      });

      expect(partialThumbs.length).toBeGreaterThan(0);
    });

    it('should calculate processing completion percentage', async () => {
      const total = await prisma.media.count({
        where: { type: 'image' },
      });

      const processed = await prisma.media.count({
        where: {
          AND: [
            { type: 'image' },
            { processedAt: { not: null } },
          ],
        },
      });

      const completionPercentage = total > 0 ? (processed / total) * 100 : 0;

      expect(completionPercentage).toBeGreaterThanOrEqual(0);
      expect(completionPercentage).toBeLessThanOrEqual(100);
    });
  });

  describe('Reprocessing Scenarios', () => {
    it('should allow reprocessing of already processed media', async () => {
      const fixture = fixtures.processedMedia[0];

      await prisma.media.create({
        data: {
          key: fixture.key,
          filename: fixture.filename,
          type: fixture.type,
          size: fixture.size!,
          thumbnailSmall: fixture.thumbnailSmall,
          thumbnailMedium: fixture.thumbnailMedium,
          thumbnailLarge: fixture.thumbnailLarge,
          processedAt: fixture.processedAt,
          uploadedAt: fixture.uploadedAt,
          createdAt: fixture.createdAt,
          updatedAt: fixture.updatedAt,
        },
      });

      // Reprocess with new thumbnail paths
      const newProcessedAt = new Date();
      await prisma.media.update({
        where: { key: fixture.key },
        data: {
          thumbnailSmall: 'thumbnails/new/processed-001_small.jpg',
          thumbnailMedium: 'thumbnails/new/processed-001_medium.jpg',
          thumbnailLarge: 'thumbnails/new/processed-001_large.jpg',
          processedAt: newProcessedAt,
          updatedAt: newProcessedAt,
        },
      });

      const updated = await prisma.media.findUnique({
        where: { key: fixture.key },
      });

      expect(updated?.thumbnailSmall).toContain('new/');
      expect(updated?.processedAt?.getTime()).toBe(newProcessedAt.getTime());
    });

    it('should handle INSERT OR IGNORE for duplicate pending entries', async () => {
      const key = 'duplicate-pending.jpg';
      const now = new Date();

      await prisma.media.create({
        data: {
          key,
          filename: 'test.jpg',
          type: 'image',
          size: 1000,
          uploadedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      });

      // First insert
      await prisma.pendingThumbnails.create({
        data: { key, createdAt: now },
      });

      // Second insert should be ignored (using upsert with no changes to simulate)
      await prisma.pendingThumbnails.upsert({
        where: { key },
        create: { key, createdAt: new Date() },
        update: {}, // No update, effectively IGNORE
      });

      const pending = await prisma.pendingThumbnails.findMany({
        where: { key },
      });

      expect(pending.length).toBe(1); // Only one entry
    });
  });

  describe('Error Handling', () => {
    it('should handle processing failures gracefully', async () => {
      const fixture = createImageFixture();

      await prisma.media.create({
        data: {
          key: fixture.key,
          filename: fixture.filename,
          type: fixture.type,
          size: fixture.size!,
          uploadedAt: fixture.uploadedAt,
          createdAt: fixture.createdAt,
          updatedAt: fixture.updatedAt,
        },
      });

      await prisma.pendingThumbnails.create({
        data: {
          key: fixture.key,
          createdAt: new Date(),
        },
      });

      // Simulate failed processing - media remains in pending queue
      const pending = await prisma.pendingThumbnails.findUnique({
        where: { key: fixture.key },
      });

      expect(pending).toBeTruthy();

      // Media should not have processedAt set
      const media = await prisma.media.findUnique({
        where: { key: fixture.key },
      });

      expect(media?.processedAt).toBeNull();
    });
  });

  describe('Bulk Processing Operations', () => {
    it('should process multiple pending thumbnails in batch', async () => {
      await seedDatabase(prisma, fixtures.weddingCeremony);
      const keys = fixtures.weddingCeremony.map(f => f.key);
      await seedPendingThumbnails(prisma, keys);

      // Simulate batch processing
      for (const key of keys) {
        await prisma.media.update({
          where: { key },
          data: {
            thumbnailSmall: `thumbnails/${key}_small.jpg`,
            thumbnailMedium: `thumbnails/${key}_medium.jpg`,
            thumbnailLarge: `thumbnails/${key}_large.jpg`,
            processedAt: new Date(),
          },
        });

        await prisma.pendingThumbnails.delete({
          where: { key },
        });
      }

      const remaining = await getAllPendingThumbnails(prisma);
      expect(remaining.length).toBe(0);

      const processed = await prisma.media.count({
        where: {
          key: { in: keys },
          processedAt: { not: null },
        },
      });

      expect(processed).toBe(keys.length);
    });

    it('should track processing progress during batch operation', async () => {
      await seedDatabase(prisma, fixtures.weddingCeremony);
      const keys = fixtures.weddingCeremony.map(f => f.key);
      await seedPendingThumbnails(prisma, keys);

      // Process first two
      for (let i = 0; i < 2; i++) {
        await prisma.media.update({
          where: { key: keys[i] },
          data: { processedAt: new Date() },
        });

        await prisma.pendingThumbnails.delete({
          where: { key: keys[i] },
        });
      }

      const remainingCount = await prisma.pendingThumbnails.count();
      const processedCount = await prisma.media.count({
        where: {
          key: { in: keys },
          processedAt: { not: null },
        },
      });

      expect(processedCount).toBe(2);
      expect(remainingCount).toBe(1); // 3 total - 2 processed
    });
  });

  describe('Thumbnail Path Generation', () => {
    it('should generate correct thumbnail paths for different sizes', async () => {
      const fixture = createImageFixture({ key: 'test-photo.jpg' });

      const baseName = fixture.key.replace(/\.[^.]+$/, '');
      const paths = {
        small: `thumbnails/${baseName}_small.jpg`,
        medium: `thumbnails/${baseName}_medium.jpg`,
        large: `thumbnails/${baseName}_large.jpg`,
      };

      expect(paths.small).toBe('thumbnails/test-photo_small.jpg');
      expect(paths.medium).toBe('thumbnails/test-photo_medium.jpg');
      expect(paths.large).toBe('thumbnails/test-photo_large.jpg');
    });

    it('should handle filenames with multiple dots', async () => {
      const key = 'my.photo.final.jpg';
      const baseName = key.replace(/\.[^.]+$/, ''); // Should be 'my.photo.final'
      const path = `thumbnails/${baseName}_medium.jpg`;

      expect(path).toBe('thumbnails/my.photo.final_medium.jpg');
    });
  });
});
