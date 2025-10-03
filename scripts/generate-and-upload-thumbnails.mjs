/**
 * Generate thumbnails and upload them to R2
 */

import Database from 'better-sqlite3';
import sharp from 'sharp';
import { unstable_dev } from 'wrangler';

const DB_PATH = './wedding-photos-metadata.db';
const DRY_RUN = !process.argv.includes('--generate');
const FORCE_REGENERATE = process.argv.includes('--force');

async function uploadToR2(worker, key, buffer, contentType = 'image/webp') {
  const resp = await worker.fetch('http://localhost/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      key,
      data: buffer.toString('base64'),
      contentType
    }),
  });

  if (!resp.ok) {
    throw new Error(`Failed to upload ${key}`);
  }
}

async function main() {
  console.log('Starting worker...');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE: Will only show what would be generated');
    console.log('   Run with --generate to actually create thumbnails');
    console.log('   Add --force to regenerate all thumbnails\n');
  } else {
    console.log(FORCE_REGENERATE ? '🔄 Force regenerate mode: Regenerating ALL thumbnails' : '📸 Generate mode: Creating missing thumbnails');
  }

  const worker = await unstable_dev('scripts/process-locally.ts', {
    config: 'scripts/wrangler-process-locally.toml',
    experimental: { disableExperimentalWarning: true },
    local: false
  });

  try {
    const db = new Database(DB_PATH);

    // Get all images from database
    const images = db.prepare(`
      SELECT key FROM media
      WHERE type = 'image'
    `).all();

    console.log(`Found ${images.length} images in database`);

    // List all existing thumbnails from R2 in one batch operation
    console.log('Fetching existing thumbnails from R2...');
    const thumbResp = await worker.fetch('http://localhost/list-thumbnails?prefix=thumbnails/medium/');
    const { keys: existingThumbs } = await thumbResp.json();
    const existingSet = new Set(existingThumbs.map(k => k.replace('thumbnails/medium/', '')));

    console.log(`Found ${existingSet.size} existing thumbnails`);
    console.log(`Checking ${images.length} images against existing thumbnails...\n`);

    let toGenerate = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of images) {
      const key = row.key;

      // Check if thumbnails already exist (unless force mode)
      if (!FORCE_REGENERATE && existingSet.has(key)) {
        skipped++;
        if (DRY_RUN) {
          console.log(`[${toGenerate + skipped + failed + 1}/${images.length}] ⏭️  ${key} (thumbnails exist)`);
        } else {
          console.log(`[${toGenerate + skipped + failed + 1}/${images.length}] Skipping ${key} (thumbnails exist)`);
        }
        continue;
      }

      if (DRY_RUN) {
        toGenerate++;
        console.log(`[${toGenerate + skipped + failed + 1}/${images.length}] 📋 Would generate: ${key}`);
        continue;
      }

      try {
        console.log(`[${toGenerate + skipped + failed + 1}/${images.length}] Processing ${key}...`);

        // Download full image from R2
        const imageResp = await worker.fetch(`http://localhost/get-full?key=${encodeURIComponent(key)}`);
        if (!imageResp.ok) {
          throw new Error('Failed to fetch full image');
        }

        const arrayBuffer = await imageResp.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Generate thumbnails (rotate() auto-rotates based on EXIF orientation)
        const [small, medium, large] = await Promise.all([
          sharp(buffer).rotate().resize(150, 150, { fit: 'cover' }).webp({ quality: 80 }).toBuffer(),
          sharp(buffer).rotate().resize(400, 400, { fit: 'cover' }).webp({ quality: 85 }).toBuffer(),
          sharp(buffer).rotate().resize(800, 800, { fit: 'inside' }).webp({ quality: 90 }).toBuffer(),
        ]);

        // Upload thumbnails to R2
        await Promise.all([
          uploadToR2(worker, `thumbnails/small/${key}`, small),
          uploadToR2(worker, `thumbnails/medium/${key}`, medium),
          uploadToR2(worker, `thumbnails/large/${key}`, large),
        ]);

        toGenerate++;
        console.log(`  ✓ Generated and uploaded thumbnails`);
      } catch (error) {
        console.error(`  ✗ Failed: ${error.message}`);
        failed++;
      }
    }

    db.close();

    console.log(`\nDone!`);
    if (DRY_RUN) {
      console.log(`Would generate: ${toGenerate}`);
      console.log(`Already exist: ${skipped}`);
      console.log(`\n💡 Run with --generate to create these thumbnails`);
    } else {
      console.log(`Generated: ${toGenerate}`);
      console.log(`Skipped: ${skipped}`);
      console.log(`Failed: ${failed}`);
    }

  } finally {
    await worker.stop();
  }
}

main().catch(console.error);
