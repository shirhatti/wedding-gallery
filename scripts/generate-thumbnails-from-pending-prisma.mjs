/**
 * Generate thumbnails for pending items using Prisma ORM
 * Prisma-based version of generate-thumbnails-from-pending.mjs
 *
 * This script:
 * 1. Queries pending thumbnails using Prisma
 * 2. Downloads media from R2 via worker
 * 3. Extracts EXIF/video metadata
 * 4. Generates and uploads thumbnails
 * 5. Updates database using type-safe Prisma operations
 * 6. Removes items from pending_thumbnails queue
 */

import { unstable_dev } from 'wrangler';
import { createLocalPrismaClient, PrismaBatchUpdater, toISOString, normalizeValue } from './lib/prisma-client.mjs';
import { generateThumbnails, uploadThumbnails, extractExifMetadata, extractVideoMetadata, extractImageDimensions } from './lib/thumbnail-generator.mjs';

async function main() {
  console.log('Starting worker...');

  const worker = await unstable_dev('scripts/process-locally.ts', {
    config: 'scripts/wrangler-process-locally.toml',
    experimental: { disableExperimentalWarning: true },
    local: false
  });

  try {
    // Initialize Prisma Client
    const prisma = createLocalPrismaClient();

    // Query pending thumbnails with media type using Prisma join
    console.log('Fetching pending thumbnails from database using Prisma...');
    const pending = await prisma.pendingThumbnails.findMany({
      select: {
        key: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    // Get media info for pending items
    const pendingWithMedia = await Promise.all(
      pending.map(async (p) => {
        const media = await prisma.media.findUnique({
          where: { key: p.key },
          select: { type: true }
        });
        return { key: p.key, type: media?.type };
      })
    );

    const validPending = pendingWithMedia.filter(p => p.type);

    if (validPending.length === 0) {
      console.log('No pending thumbnails to generate');
      await prisma.$disconnect();
      await worker.stop();
      return;
    }

    console.log(`Found ${validPending.length} pending thumbnails\n`);

    let generated = 0;
    let failed = 0;
    const completed = [];
    const batchUpdater = new PrismaBatchUpdater(prisma);

    for (const row of validPending) {
      const { key, type: mediaType } = row;

      try {
        const typeIcon = mediaType === 'video' ? '🎬' : '📸';
        console.log(`[${generated + failed + 1}/${validPending.length}] Processing ${key} ${typeIcon}...`);

        // Download full media file from R2
        const mediaResp = await worker.fetch(`http://localhost/get-full?key=${encodeURIComponent(key)}`);
        if (!mediaResp.ok) {
          throw new Error('Failed to fetch full media file');
        }

        const arrayBuffer = await mediaResp.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Extract metadata (EXIF for images, video metadata for videos)
        let metadata = null;
        let dimensions = { width: null, height: null };

        if (mediaType === 'image') {
          metadata = await extractExifMetadata(buffer);
          // Extract dimensions using sharp (more reliable than EXIF)
          dimensions = await extractImageDimensions(buffer);
        } else if (mediaType === 'video') {
          metadata = await extractVideoMetadata(buffer);
          // Video metadata includes dimensions
          dimensions = {
            width: metadata?.width || null,
            height: metadata?.height || null
          };
        }

        // Prepare update data based on media type
        const updateData = {
          width: dimensions.width,
          height: dimensions.height,
          metadata: metadata ? JSON.stringify(metadata) : null,
          updatedAt: toISOString()
        };

        if (mediaType === 'image') {
          // Image-specific EXIF data
          Object.assign(updateData, {
            dateTaken: normalizeValue(metadata?.DateTimeOriginal),
            cameraMake: normalizeValue(metadata?.Make),
            cameraModel: normalizeValue(metadata?.Model),
            lens: normalizeValue(metadata?.LensModel),
            focalLength: normalizeValue(metadata?.FocalLength),
            aperture: normalizeValue(metadata?.FNumber),
            shutterSpeed: normalizeValue(metadata?.ExposureTime),
            iso: normalizeValue(metadata?.ISO),
            latitude: normalizeValue(metadata?.latitude),
            longitude: normalizeValue(metadata?.longitude),
            altitude: normalizeValue(metadata?.GPSAltitude)
          });
        } else if (mediaType === 'video') {
          // Video-specific metadata
          Object.assign(updateData, {
            dateTaken: normalizeValue(metadata?.creation_time),
            duration: normalizeValue(metadata?.duration)
          });
        }

        // Add metadata update to batch
        batchUpdater.add((tx) =>
          tx.media.update({
            where: { key },
            data: updateData
          })
        );

        // Generate thumbnails (handles both images and videos)
        const thumbnails = await generateThumbnails(buffer, mediaType, key);

        // Upload thumbnails to R2
        await uploadThumbnails(worker, key, thumbnails);

        // Add to completed list for cleanup
        completed.push(key);

        generated++;
        console.log(`  ✓ Generated and uploaded thumbnails`);

        // Execute batch every 10 items
        if (batchUpdater.count >= 10) {
          await batchUpdater.execute();
        }

      } catch (error) {
        console.error(`  ✗ Failed: ${error.message}`);
        failed++;
      }
    }

    // Execute remaining metadata updates
    if (batchUpdater.count > 0) {
      console.log(`\nExecuting final batch of ${batchUpdater.count} metadata updates...`);
      await batchUpdater.execute();
    }

    // Remove completed items from pending_thumbnails using Prisma
    if (completed.length > 0) {
      console.log(`\nRemoving ${completed.length} items from pending_thumbnails...`);

      await prisma.pendingThumbnails.deleteMany({
        where: {
          key: {
            in: completed
          }
        }
      });

      console.log('  ✓ Pending thumbnails cleaned up');
    }

    console.log(`\nDone!`);
    console.log(`Generated: ${generated}`);
    console.log(`Failed: ${failed}`);

    await prisma.$disconnect();
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    throw error;
  } finally {
    await worker.stop();
  }
}

main().catch((error) => {
  console.error('\n❌ Script failed:', error);
  process.exit(1);
});
