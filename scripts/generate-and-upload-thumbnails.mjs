/**
 * Generate thumbnails and upload them to R2
 */

import Database from 'better-sqlite3';
import sharp from 'sharp';
import { unstable_dev } from 'wrangler';

const DB_PATH = './wedding-photos-metadata.db';

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

  const worker = await unstable_dev('scripts/process-locally.ts', {
    config: 'scripts/wrangler-process-locally.toml',
    experimental: { disableExperimentalWarning: true },
    local: false
  });

  try {
    const db = new Database(DB_PATH);

    // Get all images that need thumbnails
    const images = db.prepare(`
      SELECT key FROM media
      WHERE type = 'image'
    `).all();

    console.log(`Found ${images.length} images to process`);

    let processed = 0;
    let failed = 0;

    for (const row of images) {
      const key = row.key;

      try {
        console.log(`[${processed + failed + 1}/${images.length}] Processing ${key}...`);

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

        processed++;
        console.log(`  ✓ Generated and uploaded thumbnails`);
      } catch (error) {
        console.error(`  ✗ Failed: ${error.message}`);
        failed++;
      }
    }

    db.close();

    console.log(`\nDone!`);
    console.log(`Processed: ${processed}`);
    console.log(`Failed: ${failed}`);

  } finally {
    await worker.stop();
  }
}

main().catch(console.error);
