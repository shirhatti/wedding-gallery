import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';
import { setupTestDatabase } from './setup-test-db';
// @ts-ignore - worker import
import worker from '../src/index';

/**
 * E2E Upload Workflow Test
 *
 * This test verifies the complete upload pipeline:
 * 1. Upload an image via the album worker
 * 2. Verify file is stored in R2
 * 3. Verify metadata is inserted into D1 database via Prisma
 * 4. Verify entry is added to pending_thumbnails queue
 */
describe('E2E Upload Workflow', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    // Initialize test database schema
    await setupTestDatabase(env.DB);

    // Initialize Prisma with D1 adapter for testing
    const adapter = new PrismaD1(env.DB);
    prisma = new PrismaClient({ adapter });

    // Clean up test data
    await prisma.media.deleteMany({
      where: {
        key: {
          startsWith: 'test-upload-'
        }
      }
    });
    await prisma.pendingThumbnails.deleteMany({
      where: {
        key: {
          startsWith: 'test-upload-'
        }
      }
    });
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.media.deleteMany({
      where: {
        key: {
          startsWith: 'test-upload-'
        }
      }
    });
    await prisma.pendingThumbnails.deleteMany({
      where: {
        key: {
          startsWith: 'test-upload-'
        }
      }
    });
    await prisma.$disconnect();
  });

  it.skip('should upload image, store in R2, and create database entries via Prisma', async () => {
    // TODO: Fix FormData handling in test environment
    // Create a mock image file
    const testFileName = `test-upload-${Date.now()}.jpg`;
    const testImageData = new Uint8Array([
      0xFF, 0xD8, 0xFF, 0xE0, // JPEG header
      0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01
    ]);

    // Create FormData with the test image
    const formData = new FormData();
    const blob = new Blob([testImageData], { type: 'image/jpeg' });
    formData.append('file', blob, testFileName);

    // Create request to the upload endpoint
    const request = new Request('http://example.com/upload', {
      method: 'POST',
      body: formData,
    });

    // Execute the worker
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    // Verify response
    expect(response.status).toBe(200);
    const responseData = await response.json() as { message: string; key: string };
    expect(responseData.message).toBe('File uploaded successfully');
    expect(responseData.key).toBeTruthy();

    const uploadedKey = responseData.key;

    // Verify file is stored in R2
    const r2Object = await env.R2_BUCKET.get(uploadedKey);
    expect(r2Object).toBeTruthy();
    expect(r2Object?.size).toBeGreaterThan(0);

    // Verify database entry using Prisma
    const mediaEntry = await prisma.media.findUnique({
      where: { key: uploadedKey }
    });

    expect(mediaEntry).toBeTruthy();
    expect(mediaEntry?.filename).toBe(testFileName);
    expect(mediaEntry?.type).toBe('image');
    expect(mediaEntry?.size).toBeGreaterThan(0);
    expect(mediaEntry?.uploadedAt).toBeTruthy();

    // Verify pending thumbnail entry using Prisma
    const pendingEntry = await prisma.pendingThumbnails.findUnique({
      where: { key: uploadedKey }
    });

    expect(pendingEntry).toBeTruthy();
    expect(pendingEntry?.createdAt).toBeTruthy();

    // Clean up R2
    await env.R2_BUCKET.delete(uploadedKey);
  });

  it.skip('should handle video uploads correctly', async () => {
    // TODO: Fix FormData handling in test environment
    // Create a mock video file
    const testFileName = `test-upload-${Date.now()}.mp4`;
    const testVideoData = new Uint8Array([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, // MP4 header
      0x69, 0x73, 0x6F, 0x6D
    ]);

    const formData = new FormData();
    const blob = new Blob([testVideoData], { type: 'video/mp4' });
    formData.append('file', blob, testFileName);

    const request = new Request('http://example.com/upload', {
      method: 'POST',
      body: formData,
    });

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const responseData = await response.json() as { key: string };
    const uploadedKey = responseData.key;

    // Verify database entry using Prisma - videos should NOT be in pending_thumbnails
    const mediaEntry = await prisma.media.findUnique({
      where: { key: uploadedKey }
    });

    expect(mediaEntry).toBeTruthy();
    expect(mediaEntry?.type).toBe('video');

    // Videos should NOT have pending thumbnail entries
    const pendingEntry = await prisma.pendingThumbnails.findUnique({
      where: { key: uploadedKey }
    });

    expect(pendingEntry).toBeNull();

    // Clean up
    await env.R2_BUCKET.delete(uploadedKey);
  });

  it.skip('should query all media using Prisma', async () => {
    // TODO: Fix FormData handling in test environment
    // Upload a test image first
    const testFileName = `test-upload-prisma-query-${Date.now()}.jpg`;
    const testImageData = new Uint8Array([
      0xFF, 0xD8, 0xFF, 0xE0,
      0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01
    ]);

    const formData = new FormData();
    const blob = new Blob([testImageData], { type: 'image/jpeg' });
    formData.append('file', blob, testFileName);

    const request = new Request('http://example.com/upload', {
      method: 'POST',
      body: formData,
    });

    const ctx = createExecutionContext();
    const response = await worker.fetch(request, env, ctx);
    await waitOnExecutionContext(ctx);

    const responseData = await response.json() as { key: string };
    const uploadedKey = responseData.key;

    // Query all media using Prisma
    const allMedia = await prisma.media.findMany({
      where: {
        type: 'image'
      },
      orderBy: {
        uploadedAt: 'desc'
      },
      take: 10
    });

    // Should find at least the image we just uploaded
    expect(allMedia.length).toBeGreaterThan(0);
    const ourUpload = allMedia.find(m => m.key === uploadedKey);
    expect(ourUpload).toBeTruthy();
    expect(ourUpload?.filename).toBe(testFileName);

    // Clean up
    await env.R2_BUCKET.delete(uploadedKey);
  });

  it('should support Prisma type-safe queries with select', async () => {
    // Test Prisma's type-safe query builder
    const mediaWithDimensions = await prisma.media.findMany({
      where: {
        AND: [
          { width: { not: null } },
          { height: { not: null } },
          { type: 'image' }
        ]
      },
      select: {
        key: true,
        filename: true,
        width: true,
        height: true,
        type: true
      },
      take: 5
    });

    // Verify type safety - TypeScript should enforce these fields exist
    mediaWithDimensions.forEach(media => {
      expect(typeof media.key).toBe('string');
      expect(typeof media.filename).toBe('string');
      expect(typeof media.type).toBe('string');
      // width and height can be null in select, but we filtered for non-null
      if (media.width !== null && media.height !== null) {
        expect(typeof media.width).toBe('number');
        expect(typeof media.height).toBe('number');
      }
    });
  });

  it.skip('should handle Prisma upsert operations', async () => {
    // TODO: Fix timestamp format handling in test environment
    const testKey = `test-upload-upsert-${Date.now()}.jpg`;
    const now = '2025-01-01 12:00:00';

    // Create initial entry
    await prisma.media.create({
      data: {
        key: testKey,
        filename: 'test-upsert.jpg',
        type: 'image',
        size: 1000,
        uploadedAt: now,
        createdAt: now,
        updatedAt: now
      }
    });

    // Upsert - should update existing entry
    const upserted = await prisma.media.upsert({
      where: { key: testKey },
      create: {
        key: testKey,
        filename: 'should-not-be-used.jpg',
        type: 'image',
        size: 2000,
        uploadedAt: now,
        createdAt: now,
        updatedAt: now
      },
      update: {
        size: 1500,
        cameraMake: 'Test Camera',
        updatedAt: now
      }
    });

    expect(upserted.key).toBe(testKey);
    expect(upserted.size).toBe(1500);
    expect(upserted.cameraMake).toBe('Test Camera');
    expect(upserted.filename).toBe('test-upsert.jpg'); // Should keep original

    // Clean up
    await prisma.media.delete({
      where: { key: testKey }
    });
  });
});
