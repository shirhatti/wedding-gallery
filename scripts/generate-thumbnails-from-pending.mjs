/**
 * Generate thumbnails for pending items in D1
 * Extracts and updates EXIF metadata for images and creation time for videos
 * Supports both images and videos
 */

import { unstable_dev } from 'wrangler';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { generateThumbnails, uploadThumbnails, extractExifMetadata, extractVideoMetadata } from './lib/thumbnail-generator.mjs';

async function main() {
  console.log('Starting worker...');

  const worker = await unstable_dev('scripts/process-locally.ts', {
    config: 'scripts/wrangler-process-locally.toml',
    experimental: { disableExperimentalWarning: true },
    local: true
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
    const exifUpdates = [];

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

        // Extract metadata (EXIF for images, video metadata for videos)
        let metadata = null;
        if (mediaType === 'image') {
          metadata = await extractExifMetadata(buffer);
        } else if (mediaType === 'video') {
          metadata = await extractVideoMetadata(buffer);
        }

        // Collect metadata update SQL for batch execution later
        if (metadata) {
          const normalize = (val) => {
            if (val === null || val === undefined) return null;
            if (typeof val === 'object') return null;
            return val;
          };

          const escape = (val) => val ? `'${String(val).replace(/'/g, "''")}'` : 'NULL';

          let updateSql;
          if (mediaType === 'image') {
            // Image EXIF data
            updateSql = `
              UPDATE media SET
                date_taken = ${escape(normalize(metadata?.DateTimeOriginal))},
                camera_make = ${escape(normalize(metadata?.Make))},
                camera_model = ${escape(normalize(metadata?.Model))},
                lens = ${escape(normalize(metadata?.LensModel))},
                focal_length = ${normalize(metadata?.FocalLength) || 'NULL'},
                aperture = ${normalize(metadata?.FNumber) || 'NULL'},
                shutter_speed = ${normalize(metadata?.ExposureTime) || 'NULL'},
                iso = ${normalize(metadata?.ISO) || 'NULL'},
                latitude = ${normalize(metadata?.latitude) || 'NULL'},
                longitude = ${normalize(metadata?.longitude) || 'NULL'},
                altitude = ${normalize(metadata?.GPSAltitude) || 'NULL'},
                metadata = ${escape(JSON.stringify(metadata))},
                updated_at = ${escape(new Date().toISOString())}
              WHERE key = ${escape(key)}`;
          } else {
            // Video metadata
            updateSql = `
              UPDATE media SET
                date_taken = ${escape(normalize(metadata?.creation_time))},
                metadata = ${escape(JSON.stringify(metadata))},
                updated_at = ${escape(new Date().toISOString())}
              WHERE key = ${escape(key)}`;
          }

          exifUpdates.push(updateSql);
        }

        // Generate thumbnails (handles both images and videos)
        const thumbnails = await generateThumbnails(buffer, mediaType, key);

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

    // Execute all database updates atomically (metadata updates + cleanup)
    if (completed.length > 0 || exifUpdates.length > 0) {
      console.log(`\nUpdating database...`);
      const sqlStatements = [];

      // Add metadata updates (EXIF for images, video metadata for videos)
      if (exifUpdates.length > 0) {
        console.log(`  - ${exifUpdates.length} metadata updates`);
        sqlStatements.push(...exifUpdates);
      }

      // Add pending_thumbnails cleanup
      if (completed.length > 0) {
        console.log(`  - Removing ${completed.length} items from pending table`);
        const deleteSql = completed.map(key =>
          `DELETE FROM pending_thumbnails WHERE key = '${key.replace(/'/g, "''")}'`
        );
        sqlStatements.push(...deleteSql);
      }

      // Execute all statements in a single transaction
      const batchSql = sqlStatements.join(';\n') + ';';
      writeFileSync('/tmp/batch-update.sql', batchSql);
      execSync('npx wrangler d1 execute wedding-photos-metadata --file=/tmp/batch-update.sql --remote --yes', {
        cwd: 'workers/viewer',
        stdio: 'inherit'
      });
      console.log('  ✓ Database updated');
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
