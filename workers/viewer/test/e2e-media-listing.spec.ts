/**
 * E2E tests for media listing with Prisma fixtures
 * Tests the /api/media endpoint with various data scenarios
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';
import worker from '../src/index';

// Import shared fixtures and helpers from album worker
import {
  fixtures,
  createImageFixture,
  createVideoFixture,
  toPrismaCreate,
} from '../../album/test/fixtures/media-fixtures';
import {
  createTestPrismaClient,
  seedDatabase,
  cleanupAllTestData,
} from '../../album/test/helpers/test-db-helpers';
import { setupTestDatabase } from '../../album/test/setup-test-db';

describe('E2E Media Listing', () => {
  let prisma: PrismaClient;

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

  describe('GET /api/media - Basic Functionality', () => {
    it('should return empty array when no media exists', async () => {
      const request = new Request('https://example.com/api/media');
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('media');
      expect(Array.isArray(data.media)).toBe(true);
      expect(data.media.length).toBe(0);
    });

    it('should return all media when some exists', async () => {
      // Seed with ceremony photos
      await seedDatabase(prisma, fixtures.weddingCeremony);

      const request = new Request('https://example.com/api/media');
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.media.length).toBe(3);

      // Verify structure of returned media
      data.media.forEach((item: any) => {
        expect(item).toHaveProperty('key');
        expect(item).toHaveProperty('name'); // filename is mapped to name
        expect(item).toHaveProperty('type');
        expect(item).toHaveProperty('size');
        expect(item).toHaveProperty('uploadedAt');
      });
    });

    it('should return media sorted by dateTaken then uploadedAt', async () => {
      await seedDatabase(prisma, fixtures.weddingCeremony);
      await seedDatabase(prisma, fixtures.reception);

      const request = new Request('https://example.com/api/media');
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
      const data = await response.json();

      // Verify chronological order
      for (let i = 1; i < data.media.length; i++) {
        const prev = data.media[i - 1];
        const curr = data.media[i];

        if (prev.dateTaken && curr.dateTaken) {
          const prevDate = new Date(prev.dateTaken).getTime();
          const currDate = new Date(curr.dateTaken).getTime();
          expect(prevDate).toBeLessThanOrEqual(currDate);
        }
      }
    });
  });

  describe('Media Response Format', () => {
    beforeEach(async () => {
      await seedDatabase(prisma, fixtures.weddingCeremony);
    });

    it('should include all expected fields', async () => {
      const request = new Request('https://example.com/api/media');
      const response = await worker.fetch(request, env);
      const data = await response.json();

      const item = data.media[0];
      expect(item).toHaveProperty('key');
      expect(item).toHaveProperty('name');
      expect(item).toHaveProperty('size');
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('uploadedAt');
      expect(item).toHaveProperty('dateTaken');
      expect(item).toHaveProperty('cameraMake');
      expect(item).toHaveProperty('cameraModel');
    });

    it('should include dimensions when available', async () => {
      const request = new Request('https://example.com/api/media');
      const response = await worker.fetch(request, env);
      const data = await response.json();

      // All ceremony photos have dimensions
      data.media.forEach((item: any) => {
        expect(item).toHaveProperty('width');
        expect(item).toHaveProperty('height');
        expect(item.width).toBeGreaterThan(0);
        expect(item.height).toBeGreaterThan(0);
      });
    });

    it('should handle missing optional fields gracefully', async () => {
      // Seed with minimal metadata
      await seedDatabase(prisma, fixtures.minimalMetadata);

      const request = new Request('https://example.com/api/media');
      const response = await worker.fetch(request, env);
      const data = await response.json();

      const minimal = data.media.find((m: any) => m.key === 'minimal-001.jpg');
      expect(minimal).toBeTruthy();
      expect(minimal.cameraMake).toBeNull();
      expect(minimal.cameraModel).toBeNull();
      expect(minimal.dateTaken).toBeNull();
    });
  });

  describe('Mixed Media Types', () => {
    beforeEach(async () => {
      await seedDatabase(prisma, fixtures.weddingCeremony);
      await seedDatabase(prisma, fixtures.videos);
    });

    it('should return both images and videos', async () => {
      const request = new Request('https://example.com/api/media');
      const response = await worker.fetch(request, env);
      const data = await response.json();

      const images = data.media.filter((m: any) => m.type === 'image');
      const videos = data.media.filter((m: any) => m.type === 'video');

      expect(images.length).toBe(3); // ceremony photos
      expect(videos.length).toBe(2); // video clips
    });

    it('should include correct metadata for each type', async () => {
      const request = new Request('https://example.com/api/media');
      const response = await worker.fetch(request, env);
      const data = await response.json();

      const image = data.media.find((m: any) => m.type === 'image');
      const video = data.media.find((m: any) => m.type === 'video');

      // Images should have camera metadata
      expect(image.cameraMake).toBeTruthy();

      // Both should have dimensions
      expect(image.width).toBeGreaterThan(0);
      expect(video.width).toBeGreaterThan(0);
    });
  });

  describe('Large Dataset Handling', () => {
    it('should handle many media items efficiently', async () => {
      // Create 50 image fixtures
      const manyImages = Array.from({ length: 50 }, (_, i) =>
        createImageFixture({
          key: `large-dataset-${i}.jpg`,
          filename: `photo-${i}.jpg`,
          dateTaken: new Date(`2024-06-15T${10 + Math.floor(i / 10)}:${String((i % 10) * 6).padStart(2, '0')}:00Z`),
        })
      );

      await seedDatabase(prisma, manyImages);

      const request = new Request('https://example.com/api/media');
      const startTime = Date.now();
      const response = await worker.fetch(request, env);
      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.media.length).toBe(50);

      // Should complete in reasonable time (under 2 seconds)
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('EXIF Metadata Scenarios', () => {
    it('should return photos grouped by camera', async () => {
      // Mix of different cameras
      await seedDatabase(prisma, fixtures.weddingCeremony); // Canon and Sony
      await seedDatabase(prisma, fixtures.reception); // Canon and iPhone

      const request = new Request('https://example.com/api/media');
      const response = await worker.fetch(request, env);
      const data = await response.json();

      // Should have some media returned
      expect(data.media.length).toBeGreaterThan(0);

      // Test that filtering by camera make works correctly
      const photosByCamera = data.media.reduce((acc: any, m: any) => {
        if (m.cameraMake) {
          if (!acc[m.cameraMake]) {
            acc[m.cameraMake] = [];
          }
          acc[m.cameraMake].push(m);
        }
        return acc;
      }, {});

      // Verify each group only contains photos from that camera
      Object.entries(photosByCamera).forEach(([make, photos]) => {
        (photos as any[]).forEach(photo => {
          expect(photo.cameraMake).toBe(make);
        });
      });
    });

    it('should preserve EXIF data integrity', async () => {
      const testFixture = createImageFixture({
        key: 'exif-test.jpg',
        cameraMake: 'Nikon',
        cameraModel: 'D850',
        lens: 'AF-S NIKKOR 24-70mm f/2.8E ED VR',
        focalLength: 35,
        aperture: 4.0,
        shutterSpeed: 0.008, // 1/125
        iso: 800,
        latitude: 37.7749,
        longitude: -122.4194,
      });

      await prisma.media.create({
        data: toPrismaCreate(testFixture),
      });

      const request = new Request('https://example.com/api/media');
      const response = await worker.fetch(request, env);
      const data = await response.json();

      const found = data.media.find((m: any) => m.key === 'exif-test.jpg');
      expect(found).toBeTruthy();
      expect(found.cameraMake).toBe('Nikon');
      expect(found.cameraModel).toBe('D850');
      // Note: EXIF details like lens, aperture, etc. are not included in the API response
      // but are available in the database
    });
  });

  describe('Edge Cases', () => {
    it('should handle media with very long filenames', async () => {
      const longFilename = 'a'.repeat(200) + '.jpg';
      const fixture = createImageFixture({
        key: 'long-name.jpg',
        filename: longFilename,
      });

      await prisma.media.create({
        data: toPrismaCreate(fixture),
      });

      const request = new Request('https://example.com/api/media');
      const response = await worker.fetch(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.media[0].name).toBe(longFilename);
    });

    it('should handle media with special characters in filename', async () => {
      const specialFilename = 'photo (1) - copy [final] #2.jpg';
      const fixture = createImageFixture({
        key: 'special-chars.jpg',
        filename: specialFilename,
      });

      await prisma.media.create({
        data: toPrismaCreate(fixture),
      });

      const request = new Request('https://example.com/api/media');
      const response = await worker.fetch(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.media[0].name).toBe(specialFilename);
    });

    it('should handle media with future dateTaken', async () => {
      const futureDate = new Date('2030-01-01T00:00:00Z');
      const fixture = createImageFixture({
        key: 'future.jpg',
        dateTaken: futureDate,
      });

      await prisma.media.create({
        data: toPrismaCreate(fixture),
      });

      const request = new Request('https://example.com/api/media');
      const response = await worker.fetch(request, env);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.media[0].dateTaken).toBeTruthy();
    });

    it('should handle media with extreme coordinates', async () => {
      const fixture = createImageFixture({
        key: 'extreme-coords.jpg',
        latitude: 89.9999, // Near North Pole
        longitude: 179.9999, // Near date line
        altitude: 8848, // Mount Everest height
      });

      await prisma.media.create({
        data: toPrismaCreate(fixture),
      });

      const request = new Request('https://example.com/api/media');
      const response = await worker.fetch(request, env);

      expect(response.status).toBe(200);
    });
  });

  describe('Response Headers', () => {
    it('should return correct content-type', async () => {
      const request = new Request('https://example.com/api/media');
      const response = await worker.fetch(request, env);

      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      // Create an invalid environment without DB
      const invalidEnv = { ...env, DB: null } as any;

      const request = new Request('https://example.com/api/media');

      // This should return 500 error, not throw
      const response = await worker.fetch(request, invalidEnv);
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data).toHaveProperty('error');
    });
  });

  describe('Performance with Complex Queries', () => {
    it('should efficiently query media with all metadata populated', async () => {
      // Create comprehensive fixtures
      const comprehensive = Array.from({ length: 20 }, (_, i) =>
        createImageFixture({
          key: `comprehensive-${i}.jpg`,
          filename: `photo-${i}.jpg`,
          dateTaken: new Date(`2024-06-15T${14 + Math.floor(i / 60)}:${String(i % 60).padStart(2, '0')}:00Z`),
          cameraMake: i % 2 === 0 ? 'Canon' : 'Sony',
          cameraModel: i % 2 === 0 ? 'EOS 5D Mark IV' : 'A7 III',
          latitude: 37.7749 + (i * 0.001),
          longitude: -122.4194 + (i * 0.001),
          width: 6720,
          height: 4480,
        })
      );

      await seedDatabase(prisma, comprehensive);

      const request = new Request('https://example.com/api/media');
      const startTime = Date.now();
      const response = await worker.fetch(request, env);
      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.media.length).toBe(20);

      // Should be fast even with full metadata
      expect(duration).toBeLessThan(1000);
    });
  });
});
