/**
 * Generate thumbnails for pending items in D1
 * Also extracts and updates EXIF metadata for web-uploaded images
 * Supports both images and videos
 */

import { unstable_dev } from 'wrangler';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { generateThumbnails, uploadThumbnails, extractExifMetadata } from './lib/thumbnail-generator.mjs';

async function main() {
  console.log('Starting worker...');

  const worker = await unstable_dev('scripts/process-locally.ts', {
    config: 'scripts/wrangler-process-locally.toml',
    experimental: { disableExperimentalWarning: true },
    local: false
  });

  try {
    // Query pending thumbnails from D1 with media type
    console.log('Fetching pending thumbnails from D1...');
    const result = execSync('npx wrangler d1 execute wedding-photos-metadata --command "SELECT p.key, m.type FROM pending_thumbnails p JOIN media m ON p.key = m.key ORDER BY p.created_at" --json --remote', {
      cwd: 'workers/viewer',
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'inherit']
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
      const mediaType = row.type;

      try {
        const typeIcon = mediaType === 'video' ? '🎬' : '📸';
        console.log(`[${generated + failed + 1}/${pending.length}] Processing ${key} ${typeIcon}...`);

        // Download full media file from R2
        const mediaResp = await worker.fetch(`http://localhost/get-full?key=${encodeURIComponent(key)}`);
        if (!mediaResp.ok) {
          throw new Error('Failed to fetch full media file');
        }

        const arrayBuffer = await mediaResp.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Extract EXIF metadata (only for images, not videos)
        let exif = null;
        if (mediaType === 'image') {
          exif = await extractExifMetadata(buffer);
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
            stdio: 'inherit'
          });
        }

        // Generate thumbnails (handles both images and videos)
        const thumbnails = await generateThumbnails(buffer, mediaType);

        // Upload thumbnails to R2
        await uploadThumbnails(worker, key, thumbnails);

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
        stdio: 'inherit'
      });
      console.log('  ✓ Cleaned up pending table');
    }

    console.log(`\nDone!`);
    console.log(`Generated: ${generated}`);
    console.log(`Failed: ${failed}`);
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    if (error.stderr) {
      console.error('STDERR:', error.stderr);
    }
    if (error.stdout) {
      console.error('STDOUT:', error.stdout);
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
