/**
 * E2E tests for Prisma queries with comprehensive fixtures
 * Tests various query patterns, filters, and data relationships
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { setupTestDatabase } from './setup-test-db';
import {
  createTestPrismaClient,
  seedDatabase,
  seedPendingThumbnails,
  cleanupAllTestData,
  getMediaCountByType,
  getMediaByCamera,
  getMediaInDateRange,
  getAllPendingThumbnails,
} from './helpers/test-db-helpers';
import {
  fixtures,
  createImageFixture,
  createVideoFixture,
  sampleExifMetadata,
  sampleLocations,
} from './fixtures/media-fixtures';

describe('E2E Prisma Queries with Fixtures', () => {
  let prisma: ReturnType<typeof createTestPrismaClient>;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  beforeEach(async () => {
    // Clean up before each test
    await cleanupAllTestData(env.DB);
    // Create fresh Prisma client
    prisma = createTestPrismaClient(env.DB);
  });

  afterAll(async () => {
    await cleanupAllTestData(env.DB);
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  describe('Basic CRUD Operations', () => {
    it('should create and retrieve a single media record', async () => {
      const fixture = createImageFixture();

      await prisma.media.create({
        data: {
          key: fixture.key,
          filename: fixture.filename,
          type: fixture.type,
          size: fixture.size,
          uploadedAt: fixture.uploadedAt,
          createdAt: fixture.createdAt,
          updatedAt: fixture.updatedAt,
        },
      });

      const retrieved = await prisma.media.findUnique({
        where: { key: fixture.key },
      });

      expect(retrieved).toBeTruthy();
      expect(retrieved?.filename).toBe(fixture.filename);
      expect(retrieved?.type).toBe(fixture.type);
      expect(retrieved?.size).toBe(fixture.size);
    });

    it('should update media with EXIF metadata', async () => {
      const fixture = createImageFixture();

      // Create initial record
      await prisma.media.create({
        data: {
          key: fixture.key,
          filename: fixture.filename,
          type: fixture.type,
          size: fixture.size,
          uploadedAt: fixture.uploadedAt,
          createdAt: fixture.createdAt,
          updatedAt: fixture.updatedAt,
        },
      });

      // Update with EXIF data
      const updated = await prisma.media.update({
        where: { key: fixture.key },
        data: {
          cameraMake: sampleExifMetadata.Canon5D.make,
          cameraModel: sampleExifMetadata.Canon5D.model,
          lens: sampleExifMetadata.Canon5D.lens,
          focalLength: sampleExifMetadata.Canon5D.focalLength,
          aperture: sampleExifMetadata.Canon5D.aperture,
          shutterSpeed: sampleExifMetadata.Canon5D.shutterSpeed,
          iso: sampleExifMetadata.Canon5D.iso,
          width: 6720,
          height: 4480,
          processedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      expect(updated.cameraMake).toBe(sampleExifMetadata.Canon5D.make);
      expect(updated.cameraModel).toBe(sampleExifMetadata.Canon5D.model);
      expect(updated.focalLength).toBe(sampleExifMetadata.Canon5D.focalLength);
      expect(updated.width).toBe(6720);
      expect(updated.height).toBe(4480);
      expect(updated.processedAt).toBeTruthy();
    });

    it('should delete media record', async () => {
      const fixture = createImageFixture();

      await prisma.media.create({
        data: {
          key: fixture.key,
          filename: fixture.filename,
          type: fixture.type,
          size: fixture.size,
          uploadedAt: fixture.uploadedAt,
          createdAt: fixture.createdAt,
          updatedAt: fixture.updatedAt,
        },
      });

      await prisma.media.delete({
        where: { key: fixture.key },
      });

      const retrieved = await prisma.media.findUnique({
        where: { key: fixture.key },
      });

      expect(retrieved).toBeNull();
    });
  });

  describe('Query Filtering and Sorting', () => {
    beforeEach(async () => {
      // Seed with wedding ceremony fixtures
      await seedDatabase(prisma, fixtures.weddingCeremony);
      await seedDatabase(prisma, fixtures.reception);
      await seedDatabase(prisma, fixtures.videos);
    });

    it('should filter media by type', async () => {
      const images = await prisma.media.findMany({
        where: { type: 'image' },
      });

      const videos = await prisma.media.findMany({
        where: { type: 'video' },
      });

      expect(images.length).toBe(5); // 3 ceremony + 2 reception
      expect(videos.length).toBe(2);

      images.forEach(img => expect(img.type).toBe('image'));
      videos.forEach(vid => expect(vid.type).toBe('video'));
    });

    it('should sort media by date taken', async () => {
      const media = await prisma.media.findMany({
        where: { type: 'image' },
        orderBy: { dateTaken: 'asc' },
      });

      expect(media.length).toBeGreaterThan(0);

      // Verify chronological order
      for (let i = 1; i < media.length; i++) {
        if (media[i - 1].dateTaken && media[i].dateTaken) {
          expect(media[i - 1].dateTaken!.getTime()).toBeLessThanOrEqual(
            media[i].dateTaken!.getTime()
          );
        }
      }
    });

    it('should filter by camera make and model', async () => {
      const canonPhotos = await getMediaByCamera(
        prisma,
        sampleExifMetadata.Canon5D.make,
        sampleExifMetadata.Canon5D.model
      );

      expect(canonPhotos.length).toBeGreaterThan(0);
      canonPhotos.forEach(photo => {
        expect(photo.cameraMake).toBe(sampleExifMetadata.Canon5D.make);
        expect(photo.cameraModel).toBe(sampleExifMetadata.Canon5D.model);
      });
    });

    it('should filter media within date range', async () => {
      const ceremonyStart = new Date('2024-06-15T14:00:00Z');
      const ceremonyEnd = new Date('2024-06-15T16:00:00Z');

      const ceremonyPhotos = await getMediaInDateRange(
        prisma,
        ceremonyStart,
        ceremonyEnd
      );

      expect(ceremonyPhotos.length).toBe(4); // All ceremony photos + video-001
      ceremonyPhotos.forEach(photo => {
        expect(photo.dateTaken).toBeTruthy();
        expect(photo.dateTaken!.getTime()).toBeGreaterThanOrEqual(ceremonyStart.getTime());
        expect(photo.dateTaken!.getTime()).toBeLessThanOrEqual(ceremonyEnd.getTime());
      });
    });

    it('should filter by resolution (width and height)', async () => {
      const highRes = await prisma.media.findMany({
        where: {
          AND: [
            { width: { gte: 6000 } },
            { height: { gte: 4000 } },
          ],
        },
      });

      expect(highRes.length).toBeGreaterThan(0);
      highRes.forEach(media => {
        expect(media.width).toBeGreaterThanOrEqual(6000);
        expect(media.height).toBeGreaterThanOrEqual(4000);
      });
    });

    it('should filter by GPS location presence', async () => {
      const geotagged = await prisma.media.findMany({
        where: {
          AND: [
            { latitude: { not: null } },
            { longitude: { not: null } },
          ],
        },
      });

      expect(geotagged.length).toBe(3); // 3 ceremony photos with SF location
      geotagged.forEach(media => {
        expect(media.latitude).toBeTruthy();
        expect(media.longitude).toBeTruthy();
      });
    });
  });

  describe('Advanced Queries', () => {
    beforeEach(async () => {
      await seedDatabase(prisma, fixtures.weddingCeremony);
      await seedDatabase(prisma, fixtures.processedMedia);
      await seedDatabase(prisma, fixtures.minimalMetadata);
    });

    it('should select specific fields only', async () => {
      const media = await prisma.media.findMany({
        select: {
          key: true,
          filename: true,
          type: true,
          dateTaken: true,
        },
        take: 3,
      });

      expect(media.length).toBeLessThanOrEqual(3);
      media.forEach(m => {
        expect(m.key).toBeDefined();
        expect(m.filename).toBeDefined();
        expect(m.type).toBeDefined();
        // Other fields should not be present
        expect((m as any).size).toBeUndefined();
        expect((m as any).cameraMake).toBeUndefined();
      });
    });

    it('should find processed vs unprocessed media', async () => {
      const processed = await prisma.media.findMany({
        where: {
          processedAt: { not: null },
        },
      });

      const unprocessed = await prisma.media.findMany({
        where: {
          processedAt: null,
        },
      });

      expect(processed.length).toBe(1); // Only processedMedia fixture
      expect(unprocessed.length).toBeGreaterThan(0);

      processed.forEach(m => expect(m.processedAt).toBeTruthy());
      unprocessed.forEach(m => expect(m.processedAt).toBeNull());
    });

    it('should find media with thumbnails', async () => {
      const withThumbnails = await prisma.media.findMany({
        where: {
          AND: [
            { thumbnailSmall: { not: null } },
            { thumbnailMedium: { not: null } },
            { thumbnailLarge: { not: null } },
          ],
        },
      });

      expect(withThumbnails.length).toBe(1); // processedMedia fixture
      withThumbnails.forEach(m => {
        expect(m.thumbnailSmall).toBeTruthy();
        expect(m.thumbnailMedium).toBeTruthy();
        expect(m.thumbnailLarge).toBeTruthy();
      });
    });

    it('should find media missing dimensions', async () => {
      const missingDimensions = await prisma.media.findMany({
        where: {
          OR: [
            { width: null },
            { height: null },
          ],
        },
      });

      expect(missingDimensions.length).toBe(1); // minimalMetadata fixture
      missingDimensions.forEach(m => {
        expect(m.width === null || m.height === null).toBe(true);
      });
    });

    it('should aggregate media statistics', async () => {
      const stats = await prisma.media.aggregate({
        _count: { key: true },
        _avg: { size: true, width: true, height: true },
        _max: { size: true, dateTaken: true },
        _min: { size: true, dateTaken: true },
      });

      expect(stats._count.key).toBeGreaterThan(0);
      expect(stats._avg.size).toBeGreaterThan(0);
      expect(stats._max.size).toBeGreaterThan(0);
      expect(stats._min.size).toBeGreaterThan(0);
    });

    it('should group by camera model', async () => {
      const grouped = await prisma.media.groupBy({
        by: ['cameraModel'],
        _count: { key: true },
        where: {
          cameraModel: { not: null },
        },
      });

      expect(grouped.length).toBeGreaterThan(0);
      grouped.forEach(group => {
        expect(group.cameraModel).toBeTruthy();
        expect(group._count.key).toBeGreaterThan(0);
      });
    });
  });

  describe('Pending Thumbnails Workflow', () => {
    beforeEach(async () => {
      await seedDatabase(prisma, fixtures.weddingCeremony);
    });

    it('should create pending thumbnail entries', async () => {
      const keys = fixtures.weddingCeremony.map(f => f.key);
      await seedPendingThumbnails(prisma, keys);

      const pending = await getAllPendingThumbnails(prisma);

      expect(pending.length).toBe(keys.length);
      pending.forEach(p => {
        expect(keys).toContain(p.key);
        expect(p.createdAt).toBeTruthy();
      });
    });

    it('should remove pending thumbnail after processing', async () => {
      const fixture = fixtures.weddingCeremony[0];
      await seedPendingThumbnails(prisma, [fixture.key]);

      // Verify it exists
      let pending = await prisma.pendingThumbnails.findUnique({
        where: { key: fixture.key },
      });
      expect(pending).toBeTruthy();

      // Update media as processed
      await prisma.media.update({
        where: { key: fixture.key },
        data: {
          thumbnailSmall: `thumbnails/${fixture.key}_small.jpg`,
          thumbnailMedium: `thumbnails/${fixture.key}_medium.jpg`,
          thumbnailLarge: `thumbnails/${fixture.key}_large.jpg`,
          processedAt: new Date(),
        },
      });

      // Remove from pending
      await prisma.pendingThumbnails.delete({
        where: { key: fixture.key },
      });

      // Verify it's removed
      pending = await prisma.pendingThumbnails.findUnique({
        where: { key: fixture.key },
      });
      expect(pending).toBeNull();
    });

    it('should get oldest pending thumbnails for batch processing', async () => {
      const keys = fixtures.weddingCeremony.map(f => f.key);

      // Create pending entries with slight time delays
      for (let i = 0; i < keys.length; i++) {
        const createdAt = new Date(Date.now() + i * 1000);
        await prisma.pendingThumbnails.create({
          data: { key: keys[i], createdAt },
        });
      }

      // Get oldest 2
      const oldest = await prisma.pendingThumbnails.findMany({
        orderBy: { createdAt: 'asc' },
        take: 2,
      });

      expect(oldest.length).toBe(2);
      expect(oldest[0].key).toBe(keys[0]);
      expect(oldest[1].key).toBe(keys[1]);
    });
  });

  describe('Complex Queries with Multiple Conditions', () => {
    beforeEach(async () => {
      await seedDatabase(prisma, fixtures.weddingCeremony);
      await seedDatabase(prisma, fixtures.reception);
      await seedDatabase(prisma, fixtures.videos);
    });

    it('should find high-quality images from professional cameras', async () => {
      const professional = await prisma.media.findMany({
        where: {
          AND: [
            { type: 'image' },
            { width: { gte: 6000 } },
            { cameraMake: { in: ['Canon', 'Sony'] } },
            { cameraModel: { not: null } },
          ],
        },
        orderBy: { dateTaken: 'asc' },
      });

      expect(professional.length).toBeGreaterThan(0);
      professional.forEach(m => {
        expect(m.type).toBe('image');
        expect(m.width).toBeGreaterThanOrEqual(6000);
        expect(['Canon', 'Sony']).toContain(m.cameraMake);
      });
    });

    it('should find ceremony photos by time and location', async () => {
      const ceremonyPhotos = await prisma.media.findMany({
        where: {
          AND: [
            { type: 'image' },
            { dateTaken: { gte: new Date('2024-06-15T14:00:00Z') } },
            { dateTaken: { lte: new Date('2024-06-15T16:00:00Z') } },
            { latitude: { not: null } },
          ],
        },
      });

      expect(ceremonyPhotos.length).toBe(3);
      ceremonyPhotos.forEach(m => {
        expect(m.type).toBe('image');
        expect(m.dateTaken).toBeTruthy();
        expect(m.latitude).toBeTruthy();
      });
    });

    it('should find media by partial filename match', async () => {
      const ceremonyMedia = await prisma.media.findMany({
        where: {
          filename: { contains: 'ceremony' },
        },
      });

      expect(ceremonyMedia.length).toBeGreaterThan(0);
      ceremonyMedia.forEach(m => {
        expect(m.filename.toLowerCase()).toContain('ceremony');
      });
    });

    it('should find portrait orientation images', async () => {
      // Create a portrait image for testing
      const portrait = createImageFixture({
        key: 'portrait-001.jpg',
        width: 4480,
        height: 6720, // Height > Width
      });

      await prisma.media.create({
        data: {
          key: portrait.key,
          filename: portrait.filename,
          type: portrait.type,
          size: portrait.size!,
          width: portrait.width,
          height: portrait.height,
          uploadedAt: portrait.uploadedAt,
          createdAt: portrait.createdAt,
          updatedAt: portrait.updatedAt,
        },
      });

      // Query for portrait images using raw SQL
      const portraits = await prisma.$queryRaw<Array<{ key: string }>>`
        SELECT key FROM media
        WHERE type = 'image'
        AND height > width
        AND width IS NOT NULL
        AND height IS NOT NULL
      `;

      expect(portraits.length).toBeGreaterThan(0);
    });
  });

  describe('Upsert and Transaction Operations', () => {
    it('should upsert media with create', async () => {
      const fixture = createImageFixture();

      const result = await prisma.media.upsert({
        where: { key: fixture.key },
        create: {
          key: fixture.key,
          filename: fixture.filename,
          type: fixture.type,
          size: fixture.size,
          uploadedAt: fixture.uploadedAt,
          createdAt: fixture.createdAt,
          updatedAt: fixture.updatedAt,
        },
        update: {
          size: 999999, // Should not be used
        },
      });

      expect(result.key).toBe(fixture.key);
      expect(result.size).toBe(fixture.size); // Created, not updated
    });

    it('should upsert media with update', async () => {
      const fixture = createImageFixture();

      // Create initial record
      await prisma.media.create({
        data: {
          key: fixture.key,
          filename: fixture.filename,
          type: fixture.type,
          size: fixture.size,
          uploadedAt: fixture.uploadedAt,
          createdAt: fixture.createdAt,
          updatedAt: fixture.updatedAt,
        },
      });

      // Upsert with new size
      const result = await prisma.media.upsert({
        where: { key: fixture.key },
        create: {
          key: fixture.key,
          filename: 'should-not-use.jpg',
          type: fixture.type,
          size: 999999,
          uploadedAt: fixture.uploadedAt,
          createdAt: fixture.createdAt,
          updatedAt: fixture.updatedAt,
        },
        update: {
          size: 123456,
          updatedAt: new Date(),
        },
      });

      expect(result.key).toBe(fixture.key);
      expect(result.filename).toBe(fixture.filename); // Original filename kept
      expect(result.size).toBe(123456); // Updated
    });
  });

  describe('Helper Functions', () => {
    beforeEach(async () => {
      await seedDatabase(prisma, fixtures.weddingCeremony);
      await seedDatabase(prisma, fixtures.videos);
    });

    it('should count media by type using helper', async () => {
      const imageCount = await getMediaCountByType(prisma, 'image');
      const videoCount = await getMediaCountByType(prisma, 'video');

      expect(imageCount).toBe(3); // 3 ceremony photos
      expect(videoCount).toBe(2); // 2 videos
    });

    it('should get media by camera using helper', async () => {
      const canonMedia = await getMediaByCamera(
        prisma,
        sampleExifMetadata.Canon5D.make,
        sampleExifMetadata.Canon5D.model
      );

      // Should have at least ceremony-001 and ceremony-003
      // May have more if reception data is also seeded due to test isolation
      expect(canonMedia.length).toBeGreaterThanOrEqual(2);
      canonMedia.forEach(media => {
        expect(media.cameraMake).toBe(sampleExifMetadata.Canon5D.make);
        expect(media.cameraModel).toBe(sampleExifMetadata.Canon5D.model);
      });
    });
  });
});
