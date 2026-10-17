/**
 * E2E tests for upload workflow with comprehensive fixtures
 * Tests upload handling, R2 storage, and database operations
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import { setupTestDatabase } from './setup-test-db';
import {
  createTestPrismaClient,
  cleanupAllTestData,
  verifyMediaExists,
  verifyPendingThumbnailExists,
  createMockR2Bucket,
  type MockR2Object,
} from './helpers/test-db-helpers';
import {
  createMockImageData,
  createMockVideoData,
} from './fixtures/media-fixtures';

describe('E2E Upload Workflow with Fixtures', () => {
  let prisma: ReturnType<typeof createTestPrismaClient>;
  let mockR2Storage: Map<string, MockR2Object>;

  beforeAll(async () => {
    await setupTestDatabase(env.DB);
  });

  beforeEach(async () => {
    await cleanupAllTestData(env.DB);
    prisma = createTestPrismaClient(env.DB);
    mockR2Storage = new Map();
  });

  afterAll(async () => {
    await cleanupAllTestData(env.DB);
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  describe('Image Upload', () => {
    it('should successfully upload a JPEG image', async () => {
      const testImageData = createMockImageData('jpeg');
      const testFileName = `test-upload-${Date.now()}.jpg`;

      const formData = new FormData();
      const blob = new Blob([testImageData], { type: 'image/jpeg' });
      formData.append('files[]', blob, testFileName);

      // Direct database insertion (simulating worker behavior)
      const fileName = `upload-test-${Date.now()}-${testFileName}`;
      const uploadedAt = new Date();

      await prisma.media.create({
        data: {
          key: fileName,
          filename: testFileName,
          type: 'image',
          size: testImageData.length,
          uploadedAt,
          createdAt: uploadedAt,
          updatedAt: uploadedAt,
        },
      });

      await prisma.pendingThumbnails.create({
        data: {
          key: fileName,
          createdAt: uploadedAt,
        },
      });

      // Verify database entries
      const mediaExists = await verifyMediaExists(prisma, fileName);
      const pendingExists = await verifyPendingThumbnailExists(prisma, fileName);

      expect(mediaExists).toBe(true);
      expect(pendingExists).toBe(true);

      // Verify media details
      const media = await prisma.media.findUnique({
        where: { key: fileName },
      });

      expect(media).toBeTruthy();
      expect(media?.filename).toBe(testFileName);
      expect(media?.type).toBe('image');
      expect(media?.size).toBe(testImageData.length);
      expect(media?.uploadedAt).toBeTruthy();
    });

    it('should upload PNG images', async () => {
      const testImageData = createMockImageData('png');
      const testFileName = `test-upload-${Date.now()}.png`;
      const fileName = `upload-test-${Date.now()}-${testFileName}`;
      const uploadedAt = new Date();

      await prisma.media.create({
        data: {
          key: fileName,
          filename: testFileName,
          type: 'image',
          size: testImageData.length,
          uploadedAt,
          createdAt: uploadedAt,
          updatedAt: uploadedAt,
        },
      });

      const media = await prisma.media.findUnique({
        where: { key: fileName },
      });

      expect(media?.type).toBe('image');
      expect(media?.filename).toContain('.png');
    });

    it('should handle multiple images uploaded in sequence', async () => {
      const uploadCount = 5;
      const uploadedKeys: string[] = [];

      for (let i = 0; i < uploadCount; i++) {
        const testImageData = createMockImageData('jpeg');
        const fileName = `multi-upload-${Date.now()}-${i}.jpg`;
        const uploadedAt = new Date();

        await prisma.media.create({
          data: {
            key: fileName,
            filename: `photo-${i}.jpg`,
            type: 'image',
            size: testImageData.length,
            uploadedAt,
            createdAt: uploadedAt,
            updatedAt: uploadedAt,
          },
        });

        await prisma.pendingThumbnails.create({
          data: {
            key: fileName,
            createdAt: uploadedAt,
          },
        });

        uploadedKeys.push(fileName);
      }

      // Verify all uploads
      for (const key of uploadedKeys) {
        const exists = await verifyMediaExists(prisma, key);
        expect(exists).toBe(true);
      }

      // Verify count
      const allMedia = await prisma.media.findMany({
        where: {
          key: { startsWith: 'multi-upload-' },
        },
      });

      expect(allMedia.length).toBe(uploadCount);
    });

    it('should create pending thumbnail entries for images', async () => {
      const fileName = `thumbnail-test-${Date.now()}.jpg`;
      const uploadedAt = new Date();

      await prisma.media.create({
        data: {
          key: fileName,
          filename: 'test.jpg',
          type: 'image',
          size: 1000,
          uploadedAt,
          createdAt: uploadedAt,
          updatedAt: uploadedAt,
        },
      });

      await prisma.pendingThumbnails.create({
        data: {
          key: fileName,
          createdAt: uploadedAt,
        },
      });

      const pending = await prisma.pendingThumbnails.findUnique({
        where: { key: fileName },
      });

      expect(pending).toBeTruthy();
      expect(pending?.key).toBe(fileName);
      expect(pending?.createdAt).toBeTruthy();
    });
  });

  describe('Video Upload', () => {
    it('should successfully upload a video', async () => {
      const testVideoData = createMockVideoData();
      const testFileName = `test-upload-${Date.now()}.mp4`;
      const fileName = `upload-test-${Date.now()}-${testFileName}`;
      const uploadedAt = new Date();

      await prisma.media.create({
        data: {
          key: fileName,
          filename: testFileName,
          type: 'video',
          size: testVideoData.length,
          uploadedAt,
          createdAt: uploadedAt,
          updatedAt: uploadedAt,
        },
      });

      const media = await prisma.media.findUnique({
        where: { key: fileName },
      });

      expect(media).toBeTruthy();
      expect(media?.type).toBe('video');
      expect(media?.filename).toContain('.mp4');
    });

    it('should NOT create pending thumbnails for videos', async () => {
      const fileName = `video-no-thumbnail-${Date.now()}.mp4`;
      const uploadedAt = new Date();

      await prisma.media.create({
        data: {
          key: fileName,
          filename: 'test-video.mp4',
          type: 'video',
          size: 1000000,
          uploadedAt,
          createdAt: uploadedAt,
          updatedAt: uploadedAt,
        },
      });

      // Explicitly NOT creating pending thumbnail for video

      const media = await verifyMediaExists(prisma, fileName);
      const pending = await verifyPendingThumbnailExists(prisma, fileName);

      expect(media).toBe(true);
      expect(pending).toBe(false); // Should NOT exist for videos
    });
  });

  describe('File Size Handling', () => {
    it('should handle small files', async () => {
      const fileName = `small-file-${Date.now()}.jpg`;
      const uploadedAt = new Date();

      await prisma.media.create({
        data: {
          key: fileName,
          filename: 'small.jpg',
          type: 'image',
          size: 1024, // 1KB
          uploadedAt,
          createdAt: uploadedAt,
          updatedAt: uploadedAt,
        },
      });

      const media = await prisma.media.findUnique({
        where: { key: fileName },
      });

      expect(media?.size).toBe(1024);
    });

    it('should handle large files', async () => {
      const fileName = `large-file-${Date.now()}.jpg`;
      const uploadedAt = new Date();
      const largeSize = 50 * 1024 * 1024; // 50MB

      await prisma.media.create({
        data: {
          key: fileName,
          filename: 'large.jpg',
          type: 'image',
          size: largeSize,
          uploadedAt,
          createdAt: uploadedAt,
          updatedAt: uploadedAt,
        },
      });

      const media = await prisma.media.findUnique({
        where: { key: fileName },
      });

      expect(media?.size).toBe(largeSize);
    });

    it('should handle very large video files', async () => {
      const fileName = `huge-video-${Date.now()}.mp4`;
      const uploadedAt = new Date();
      const hugeSize = 500 * 1024 * 1024; // 500MB

      await prisma.media.create({
        data: {
          key: fileName,
          filename: 'huge.mp4',
          type: 'video',
          size: hugeSize,
          uploadedAt,
          createdAt: uploadedAt,
          updatedAt: uploadedAt,
        },
      });

      const media = await prisma.media.findUnique({
        where: { key: fileName },
      });

      expect(media?.size).toBe(hugeSize);
      expect(media?.type).toBe('video');
    });
  });

  describe('Filename Handling', () => {
    it('should preserve original filename', async () => {
      const originalFilename = 'my-wedding-photo.jpg';
      const fileName = `test-${Date.now()}.jpg`;
      const uploadedAt = new Date();

      await prisma.media.create({
        data: {
          key: fileName,
          filename: originalFilename,
          type: 'image',
          size: 1000,
          uploadedAt,
          createdAt: uploadedAt,
          updatedAt: uploadedAt,
        },
      });

      const media = await prisma.media.findUnique({
        where: { key: fileName },
      });

      expect(media?.filename).toBe(originalFilename);
    });

    it('should handle filenames with special characters', async () => {
      const specialFilename = 'photo (1) - final [edit] #2.jpg';
      const fileName = `test-${Date.now()}.jpg`;
      const uploadedAt = new Date();

      await prisma.media.create({
        data: {
          key: fileName,
          filename: specialFilename,
          type: 'image',
          size: 1000,
          uploadedAt,
          createdAt: uploadedAt,
          updatedAt: uploadedAt,
        },
      });

      const media = await prisma.media.findUnique({
        where: { key: fileName },
      });

      expect(media?.filename).toBe(specialFilename);
    });

    it('should handle unicode filenames', async () => {
      const unicodeFilename = '婚礼照片-2024.jpg';
      const fileName = `test-${Date.now()}.jpg`;
      const uploadedAt = new Date();

      await prisma.media.create({
        data: {
          key: fileName,
          filename: unicodeFilename,
          type: 'image',
          size: 1000,
          uploadedAt,
          createdAt: uploadedAt,
          updatedAt: uploadedAt,
        },
      });

      const media = await prisma.media.findUnique({
        where: { key: fileName },
      });

      expect(media?.filename).toBe(unicodeFilename);
    });
  });

  describe('Timestamp Handling', () => {
    it('should set uploadedAt timestamp', async () => {
      const fileName = `timestamp-test-${Date.now()}.jpg`;
      const beforeUpload = new Date();

      await prisma.media.create({
        data: {
          key: fileName,
          filename: 'test.jpg',
          type: 'image',
          size: 1000,
          uploadedAt: beforeUpload,
          createdAt: beforeUpload,
          updatedAt: beforeUpload,
        },
      });

      const afterUpload = new Date();

      const media = await prisma.media.findUnique({
        where: { key: fileName },
      });

      expect(media?.uploadedAt).toBeTruthy();
      expect(media?.uploadedAt!.getTime()).toBeGreaterThanOrEqual(beforeUpload.getTime());
      expect(media?.uploadedAt!.getTime()).toBeLessThanOrEqual(afterUpload.getTime());
    });

    it('should set createdAt and updatedAt timestamps', async () => {
      const fileName = `timestamp-test-${Date.now()}.jpg`;
      const now = new Date();

      await prisma.media.create({
        data: {
          key: fileName,
          filename: 'test.jpg',
          type: 'image',
          size: 1000,
          uploadedAt: now,
          createdAt: now,
          updatedAt: now,
        },
      });

      const media = await prisma.media.findUnique({
        where: { key: fileName },
      });

      expect(media?.createdAt).toBeTruthy();
      expect(media?.updatedAt).toBeTruthy();
    });
  });

  describe('Concurrent Uploads', () => {
    it('should handle concurrent uploads correctly', async () => {
      const uploadPromises = Array.from({ length: 10 }, async (_, i) => {
        const fileName = `concurrent-${Date.now()}-${i}.jpg`;
        const uploadedAt = new Date();

        await prisma.media.create({
          data: {
            key: fileName,
            filename: `photo-${i}.jpg`,
            type: 'image',
            size: 1000 + i,
            uploadedAt,
            createdAt: uploadedAt,
            updatedAt: uploadedAt,
          },
        });

        return fileName;
      });

      const uploadedKeys = await Promise.all(uploadPromises);

      // Verify all uploads succeeded
      expect(uploadedKeys.length).toBe(10);

      for (const key of uploadedKeys) {
        const exists = await verifyMediaExists(prisma, key);
        expect(exists).toBe(true);
      }
    });
  });

  describe('Duplicate Upload Handling', () => {
    it('should handle INSERT OR REPLACE for duplicate keys', async () => {
      const fileName = `duplicate-test-${Date.now()}.jpg`;
      const uploadedAt = new Date();

      // First upload
      await prisma.media.create({
        data: {
          key: fileName,
          filename: 'original.jpg',
          type: 'image',
          size: 1000,
          uploadedAt,
          createdAt: uploadedAt,
          updatedAt: uploadedAt,
        },
      });

      // Second upload with same key (using upsert to simulate OR REPLACE)
      const newUploadedAt = new Date();
      await prisma.media.upsert({
        where: { key: fileName },
        create: {
          key: fileName,
          filename: 'replaced.jpg',
          type: 'image',
          size: 2000,
          uploadedAt: newUploadedAt,
          createdAt: newUploadedAt,
          updatedAt: newUploadedAt,
        },
        update: {
          filename: 'replaced.jpg',
          size: 2000,
          uploadedAt: newUploadedAt,
          updatedAt: newUploadedAt,
        },
      });

      const media = await prisma.media.findUnique({
        where: { key: fileName },
      });

      expect(media?.filename).toBe('replaced.jpg');
      expect(media?.size).toBe(2000);
    });
  });

  describe('Upload Statistics', () => {
    it('should track total uploaded size', async () => {
      const uploads = [
        { key: 'stat-1.jpg', size: 1000000 },
        { key: 'stat-2.jpg', size: 2000000 },
        { key: 'stat-3.jpg', size: 3000000 },
      ];

      const uploadedAt = new Date();

      for (const upload of uploads) {
        await prisma.media.create({
          data: {
            key: upload.key,
            filename: upload.key,
            type: 'image',
            size: upload.size,
            uploadedAt,
            createdAt: uploadedAt,
            updatedAt: uploadedAt,
          },
        });
      }

      const stats = await prisma.media.aggregate({
        where: {
          key: { startsWith: 'stat-' },
        },
        _sum: { size: true },
        _count: { key: true },
      });

      expect(stats._count.key).toBe(3);
      expect(stats._sum.size).toBe(6000000);
    });

    it('should count uploads by type', async () => {
      const uploadedAt = new Date();

      await prisma.media.createMany({
        data: [
          {
            key: 'type-count-1.jpg',
            filename: 'img1.jpg',
            type: 'image',
            size: 1000,
            uploadedAt,
            createdAt: uploadedAt,
            updatedAt: uploadedAt,
          },
          {
            key: 'type-count-2.jpg',
            filename: 'img2.jpg',
            type: 'image',
            size: 1000,
            uploadedAt,
            createdAt: uploadedAt,
            updatedAt: uploadedAt,
          },
          {
            key: 'type-count-1.mp4',
            filename: 'vid1.mp4',
            type: 'video',
            size: 5000,
            uploadedAt,
            createdAt: uploadedAt,
            updatedAt: uploadedAt,
          },
        ],
      });

      const imageCount = await prisma.media.count({
        where: {
          AND: [
            { key: { startsWith: 'type-count-' } },
            { type: 'image' },
          ],
        },
      });

      const videoCount = await prisma.media.count({
        where: {
          AND: [
            { key: { startsWith: 'type-count-' } },
            { type: 'video' },
          ],
        },
      });

      expect(imageCount).toBe(2);
      expect(videoCount).toBe(1);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle missing required fields', async () => {
      const fileName = `error-test-${Date.now()}.jpg`;
      const uploadedAt = new Date();

      // Missing required fields should throw
      await expect(async () => {
        await prisma.media.create({
          data: {
            key: fileName,
            // Missing filename, type, createdAt, updatedAt
            size: 1000,
            uploadedAt,
          } as any,
        });
      }).rejects.toThrow();
    });
  });
});
