/**
 * Extract dimensions for ALL media items using Prisma ORM
 * Prisma-based version of extract-all-dimensions.mjs
 *
 * This script:
 * 1. Queries all media from database using Prisma
 * 2. Downloads each file from R2 via worker
 * 3. Extracts dimensions using Sharp/ffprobe
 * 4. Updates database using type-safe Prisma operations
 */

import { unstable_dev } from 'wrangler';
import { createLocalPrismaClient, PrismaBatchUpdater, toISOString } from './lib/prisma-client.mjs';
import { extractVideoMetadata, extractImageDimensions } from './lib/thumbnail-generator.mjs';

async function main() {
  console.log('Starting worker...');

  const worker = await unstable_dev('scripts/process-locally.ts', {
    config: 'scripts/wrangler-process-locally.toml',
    experimental: { disableExperimentalWarning: true },
    local: false
  });

  try {
    // Initialize Prisma Client for local database
    const prisma = createLocalPrismaClient();

    // Query ALL media from database using Prisma
    console.log('Fetching all media from database using Prisma...');
    const allMedia = await prisma.media.findMany({
      select: {
        key: true,
        type: true,
        width: true,
        height: true
      },
      orderBy: {
        uploadedAt: 'asc'
      }
    });

    if (allMedia.length === 0) {
      console.log('No media found in database');
      await prisma.$disconnect();
      await worker.stop();
      return;
    }

    console.log(`Found ${allMedia.length} media items\n`);

    let processed = 0;
    let failed = 0;
    let skipped = 0;

    // Create batch updater for efficient database updates
    const batchUpdater = new PrismaBatchUpdater(prisma);

    for (const media of allMedia) {
      const { key, type: mediaType, width, height } = media;

      try {
        const typeIcon = mediaType === 'video' ? '🎬' : '📸';
        console.log(`[${processed + failed + skipped + 1}/${allMedia.length}] Processing ${key} ${typeIcon}...`);

        // Skip if dimensions already exist
        if (width && height) {
          console.log(`  ⊘ Skipped: Dimensions already exist (${width}x${height})`);
          skipped++;
          continue;
        }

        // Download media file from R2 via worker
        const mediaResp = await worker.fetch(`http://localhost/get-full?key=${encodeURIComponent(key)}`);
        if (!mediaResp.ok) {
          throw new Error('Failed to fetch media file');
        }

        const arrayBuffer = await mediaResp.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Extract dimensions based on media type
        let dimensions = { width: null, height: null };

        if (mediaType === 'image') {
          dimensions = await extractImageDimensions(buffer);
        } else if (mediaType === 'video') {
          const metadata = await extractVideoMetadata(buffer);
          dimensions = {
            width: metadata?.width || null,
            height: metadata?.height || null
          };
        } else {
          console.log(`  ⊘ Skipped: Unknown media type '${mediaType}'`);
          skipped++;
          continue;
        }

        // Only update if we got valid dimensions
        if (dimensions.width && dimensions.height) {
          // Add Prisma update operation to batch
          batchUpdater.add((tx) =>
            tx.media.update({
              where: { key },
              data: {
                width: dimensions.width,
                height: dimensions.height,
                updatedAt: toISOString()
              }
            })
          );

          processed++;
          console.log(`  ✓ Extracted dimensions: ${dimensions.width}x${dimensions.height}`);
        } else {
          console.log(`  ⚠ Could not extract dimensions`);
          failed++;
        }

        // Execute batch updates every 50 items to avoid memory issues
        if (batchUpdater.count >= 50) {
          await batchUpdater.execute();
        }

      } catch (error) {
        console.error(`  ✗ Failed: ${error.message}`);
        failed++;
      }
    }

    // Execute remaining batch updates
    if (batchUpdater.count > 0) {
      console.log(`\nExecuting final batch of ${batchUpdater.count} updates...`);
      await batchUpdater.execute();
    }

    console.log(`\nDone!`);
    console.log(`Processed: ${processed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: ${skipped}`);

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
