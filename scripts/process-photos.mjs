/**
 * Process all photos and generate SQLite database
 * Uses Wrangler SDK to access R2
 */

import Database from 'better-sqlite3';
import exifr from 'exifr';
import { unstable_dev } from 'wrangler';

const DB_PATH = './wedding-photos-metadata.db';

async function main() {
  console.log('Starting worker...');

  // Start the worker to get access to bindings
  const worker = await unstable_dev('scripts/process-locally.ts', {
    config: 'scripts/wrangler-process-locally.toml',
    experimental: { disableExperimentalWarning: true },
    local: false // Use remote bindings
  });

  try {
    // Create database
    const db = new Database(DB_PATH);

    // Create tables (matching remote D1 schema)
    db.exec(`
      CREATE TABLE IF NOT EXISTS media (
        key TEXT PRIMARY KEY,
        filename TEXT NOT NULL,
        type TEXT NOT NULL,
        size INTEGER,
        uploaded_at TEXT,
        date_taken TEXT,
        camera_make TEXT,
        camera_model TEXT,
        lens TEXT,
        focal_length REAL,
        aperture REAL,
        shutter_speed REAL,
        iso INTEGER,
        latitude REAL,
        longitude REAL,
        altitude REAL,
        duration REAL,
        codec TEXT,
        width INTEGER,
        height INTEGER,
        thumbnail_small TEXT,
        thumbnail_medium TEXT,
        thumbnail_large TEXT,
        metadata TEXT,
        processed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // List all objects via worker
    console.log('Listing files from R2...');
    const listResp = await worker.fetch('http://localhost/list');
    const objects = await listResp.json();
    console.log(`Found ${objects.length} files`);

    const insertStmt = db.prepare(`
      INSERT OR REPLACE INTO media (
        key, filename, type, size, uploaded_at,
        date_taken, camera_make, camera_model, lens,
        focal_length, aperture, shutter_speed, iso,
        latitude, longitude, altitude,
        duration, codec, width, height,
        thumbnail_small, thumbnail_medium, thumbnail_large,
        metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    let processed = 0;
    let failed = 0;

    for (const obj of objects) {
      const key = obj.key;

      // Skip non-image files
      if (!isImageFile(key)) {
        console.log(`Skipping ${key} (not an image)`);
        continue;
      }

      try {
        console.log(`Processing ${key}...`);

        // Fetch EXIF via worker
        const exifResp = await worker.fetch(`http://localhost/get?key=${encodeURIComponent(key)}`);
        if (!exifResp.ok) {
          throw new Error('Failed to fetch object');
        }

        const { exif } = await exifResp.json();

        // Normalize EXIF values to primitives
        const normalize = (val) => {
          if (val === null || val === undefined) return null;
          if (typeof val === 'object') return null; // Skip complex objects
          return val;
        };

        // Insert into database
        insertStmt.run(
          key,
          key.split('/').pop(),
          'image',
          obj.size,
          obj.uploaded,
          normalize(exif?.DateTimeOriginal),
          normalize(exif?.Make),
          normalize(exif?.Model),
          normalize(exif?.LensModel),
          normalize(exif?.FocalLength),
          normalize(exif?.FNumber),
          normalize(exif?.ExposureTime),
          normalize(exif?.ISO),
          normalize(exif?.latitude),
          normalize(exif?.longitude),
          normalize(exif?.GPSAltitude),
          null, // duration (for videos)
          null, // codec (for videos)
          null, // width (TODO: extract from image)
          null, // height (TODO: extract from image)
          null, // thumbnail_small (TODO: generate)
          null, // thumbnail_medium (TODO: generate)
          null, // thumbnail_large (TODO: generate)
          exif ? JSON.stringify(exif) : null
        );

        processed++;
        console.log(`  ✓ Processed (${processed}/${objects.length})`);
      } catch (error) {
        console.error(`  ✗ Failed to process ${key}:`, error.message);
        failed++;
      }
    }

    db.close();

    console.log(`\nDone!`);
    console.log(`Processed: ${processed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Database saved to: ${DB_PATH}`);
    console.log(`\nTo upload to D1, run:`);
    console.log(`  npx wrangler d1 execute wedding-photos-metadata --file=${DB_PATH}`);

  } finally {
    await worker.stop();
  }
}

function isImageFile(key) {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(key);
}

main().catch(console.error);
