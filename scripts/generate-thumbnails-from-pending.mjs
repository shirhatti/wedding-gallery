/**
 * Generate thumbnails for pending items in D1
 * Also extracts and updates EXIF metadata for web-uploaded images
 */

import sharp from 'sharp';
import { unstable_dev } from 'wrangler';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import exifr from 'exifr';

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
    // Query pending thumbnails from D1
    console.log('Fetching pending thumbnails from D1...');
    const result = execSync('npx wrangler d1 execute wedding-photos-metadata --command "SELECT key FROM pending_thumbnails ORDER BY created_at" --json --remote', {
      cwd: 'workers/viewer',
      encoding: 'utf8'
    });

    const data = JSON.parse(result);
    const pending = data[0]?.results || [];

    if (pending.length === 0) {
      console.log('No pending thumbnails to generate');
      await worker.stop();
      return;
    }

    console.log(`Found ${pending.length} pending thumbnails\n`);

    let generated = 0;
    let failed = 0;
    const completed = [];

    for (const row of pending) {
      const key = row.key;

      try {
        console.log(`[${generated + failed + 1}/${pending.length}] Processing ${key}...`);

        // Download full image from R2
        const imageResp = await worker.fetch(`http://localhost/get-full?key=${encodeURIComponent(key)}`);
        if (!imageResp.ok) {
          throw new Error('Failed to fetch full image');
        }

        const arrayBuffer = await imageResp.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Extract EXIF metadata
        let exif = null;
        try {
          exif = await exifr.parse(buffer, {
            pick: ['DateTimeOriginal', 'Make', 'Model', 'LensModel',
                   'FocalLength', 'FNumber', 'ExposureTime', 'ISO',
                   'latitude', 'longitude', 'GPSAltitude']
          });
        } catch (e) {
          // No EXIF data
        }

        // Update media table with EXIF if found
        if (exif) {
          const normalize = (val) => {
            if (val === null || val === undefined) return null;
            if (typeof val === 'object') return null;
            return val;
          };

          const escape = (val) => val ? `'${String(val).replace(/'/g, "''")}'` : 'NULL';

          const updateSql = `
            UPDATE media SET
              date_taken = ${escape(normalize(exif?.DateTimeOriginal))},
              camera_make = ${escape(normalize(exif?.Make))},
              camera_model = ${escape(normalize(exif?.Model))},
              lens = ${escape(normalize(exif?.LensModel))},
              focal_length = ${normalize(exif?.FocalLength) || 'NULL'},
              aperture = ${normalize(exif?.FNumber) || 'NULL'},
              shutter_speed = ${normalize(exif?.ExposureTime) || 'NULL'},
              iso = ${normalize(exif?.ISO) || 'NULL'},
              latitude = ${normalize(exif?.latitude) || 'NULL'},
              longitude = ${normalize(exif?.longitude) || 'NULL'},
              altitude = ${normalize(exif?.GPSAltitude) || 'NULL'},
              metadata = ${escape(JSON.stringify(exif))},
              updated_at = ${escape(new Date().toISOString())}
            WHERE key = ${escape(key)};
          `;

          writeFileSync('/tmp/exif-update.sql', updateSql);
          execSync('npx wrangler d1 execute wedding-photos-metadata --file=/tmp/exif-update.sql --remote', {
            cwd: 'workers/viewer',
            stdio: 'pipe'
          });
        }

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

        generated++;
        completed.push(key);
        console.log(`  ✓ Generated and uploaded thumbnails`);
      } catch (error) {
        console.error(`  ✗ Failed: ${error.message}`);
        failed++;
      }
    }

    // Remove completed items from pending_thumbnails
    if (completed.length > 0) {
      console.log(`\nRemoving ${completed.length} completed items from pending table...`);
      const deleteSql = completed.map(key =>
        `DELETE FROM pending_thumbnails WHERE key = '${key.replace(/'/g, "''")}'`
      ).join(';\n') + ';';

      writeFileSync('/tmp/cleanup.sql', deleteSql);
      execSync('npx wrangler d1 execute wedding-photos-metadata --file=/tmp/cleanup.sql --remote', {
        cwd: 'workers/viewer',
        stdio: 'pipe'
      });
      console.log('  ✓ Cleaned up pending table');
    }

    console.log(`\nDone!`);
    console.log(`Generated: ${generated}`);
    console.log(`Failed: ${failed}`);
  } finally {
    await worker.stop();
  }
}

main().catch(console.error);
