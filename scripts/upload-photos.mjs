/**
 * Upload photos to R2 and track them in D1 for thumbnail generation
 * Usage: node scripts/upload-photos.mjs <directory>
 */

import { readdirSync, statSync, writeFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import exifr from 'exifr';

const PHOTOS_DIR = process.argv[2];

if (!PHOTOS_DIR) {
  console.error('Usage: node scripts/upload-photos.mjs <directory>');
  process.exit(1);
}

async function main() {
  // Get all image files
  const files = readdirSync(PHOTOS_DIR)
    .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
    .map(f => join(PHOTOS_DIR, f));

  console.log(`Found ${files.length} images to upload\n`);

  let uploaded = 0;
  let failed = 0;

  for (const filePath of files) {
    const fileName = filePath.split('/').pop();
    const key = fileName;

    try {
      console.log(`[${uploaded + failed + 1}/${files.length}] Uploading ${fileName}...`);

      const stats = statSync(filePath);

      // Extract EXIF
      let exif = null;
      try {
        exif = await exifr.parse(filePath, {
          pick: ['DateTimeOriginal', 'Make', 'Model', 'LensModel',
                 'FocalLength', 'FNumber', 'ExposureTime', 'ISO',
                 'latitude', 'longitude', 'GPSAltitude']
        });
      } catch (e) {
        console.log('  No EXIF data found');
      }

      // Upload to R2
      execSync(`npx wrangler r2 object put wedding-photos-metadata/${key} --file="${filePath}" --remote`, {
        cwd: 'workers/viewer',
        stdio: 'pipe'
      });

      // Normalize EXIF values
      const normalize = (val) => {
        if (val === null || val === undefined) return null;
        if (typeof val === 'object') return null;
        return val;
      };

      const escape = (val) => val ? `'${String(val).replace(/'/g, "''")}'` : 'NULL';

      // Insert into media table
      const mediaSql = `
        INSERT OR REPLACE INTO media (
          key, filename, type, size, uploaded_at,
          date_taken, camera_make, camera_model, lens,
          focal_length, aperture, shutter_speed, iso,
          latitude, longitude, altitude,
          metadata, created_at, updated_at
        ) VALUES (
          ${escape(key)}, ${escape(fileName)}, 'image', ${stats.size}, ${escape(new Date().toISOString())},
          ${escape(normalize(exif?.DateTimeOriginal))}, ${escape(normalize(exif?.Make))}, ${escape(normalize(exif?.Model))}, ${escape(normalize(exif?.LensModel))},
          ${normalize(exif?.FocalLength) || 'NULL'}, ${normalize(exif?.FNumber) || 'NULL'}, ${normalize(exif?.ExposureTime) || 'NULL'}, ${normalize(exif?.ISO) || 'NULL'},
          ${normalize(exif?.latitude) || 'NULL'}, ${normalize(exif?.longitude) || 'NULL'}, ${normalize(exif?.GPSAltitude) || 'NULL'},
          ${escape(exif ? JSON.stringify(exif) : null)}, ${escape(new Date().toISOString())}, ${escape(new Date().toISOString())}
        );
      `;

      // Insert into pending_thumbnails table
      const pendingSql = `
        INSERT OR IGNORE INTO pending_thumbnails (key, created_at)
        VALUES (${escape(key)}, ${escape(new Date().toISOString())});
      `;

      // Write SQL to temp file and execute
      writeFileSync('/tmp/upload.sql', mediaSql + '\n' + pendingSql);
      execSync('npx wrangler d1 execute wedding-photos-metadata --file=/tmp/upload.sql --remote', {
        cwd: 'workers/viewer',
        stdio: 'pipe'
      });

      uploaded++;
      console.log(`  ✓ Uploaded to R2 and tracked in D1`);
    } catch (error) {
      console.error(`  ✗ Failed: ${error.message}`);
      failed++;
    }
  }

  console.log(`\nDone!`);
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);
