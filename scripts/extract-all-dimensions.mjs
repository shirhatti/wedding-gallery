/**
 * Extract dimensions for ALL media items in R2 and update D1 database
 * One-time migration script to populate width/height for existing media
 */

import { unstable_dev } from 'wrangler';
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { extractVideoMetadata, extractImageDimensions } from './lib/thumbnail-generator.mjs';

async function main() {
  console.log('Starting worker...');

  const worker = await unstable_dev('scripts/process-locally.ts', {
    config: 'scripts/wrangler-process-locally.toml',
    experimental: { disableExperimentalWarning: true },
    local: false
  });

  try {
    // Query ALL media from D1
    console.log('Fetching all media from D1...');
    const result = execSync('npx wrangler d1 execute wedding-photos-metadata --command "SELECT key, type FROM media ORDER BY uploaded_at" --json --remote', {
      cwd: 'workers/viewer',
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'inherit']
    });

    const data = JSON.parse(result);
    const allMedia = data[0]?.results || [];

    if (allMedia.length === 0) {
      console.log('No media found in database');
      await worker.stop();
      return;
    }

    console.log(`Found ${allMedia.length} media items\n`);

    let processed = 0;
    let failed = 0;
    let skipped = 0;
    const dimensionUpdates = [];

    for (const row of allMedia) {
      const key = row.key;
      const mediaType = row.type;

      try {
        const typeIcon = mediaType === 'video' ? '🎬' : '📸';
        console.log(`[${processed + failed + skipped + 1}/${allMedia.length}] Processing ${key} ${typeIcon}...`);

        // Download media file from R2
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
          const escape = (val) => val ? `'${String(val).replace(/'/g, "''")}'` : 'NULL';

          const updateSql = `
            UPDATE media SET
              width = ${dimensions.width},
              height = ${dimensions.height},
              updated_at = ${escape(new Date().toISOString())}
            WHERE key = ${escape(key)}`;

          dimensionUpdates.push(updateSql);

          processed++;
          console.log(`  ✓ Extracted dimensions: ${dimensions.width}x${dimensions.height}`);
        } else {
          console.log(`  ⚠ Could not extract dimensions`);
          failed++;
        }
      } catch (error) {
        console.error(`  ✗ Failed: ${error.message}`);
        failed++;
      }
    }

    // Execute all database updates
    if (dimensionUpdates.length > 0) {
      console.log(`\nUpdating database with ${dimensionUpdates.length} dimension entries...`);

      const batchSql = dimensionUpdates.join(';\n') + ';';
      writeFileSync('/tmp/dimensions-update.sql', batchSql);

      execSync('npx wrangler d1 execute wedding-photos-metadata --file=/tmp/dimensions-update.sql --remote --yes', {
        cwd: 'workers/viewer',
        stdio: 'inherit'
      });

      console.log('  ✓ Database updated');
    }

    console.log(`\nDone!`);
    console.log(`Processed: ${processed}`);
    console.log(`Failed: ${failed}`);
    console.log(`Skipped: ${skipped}`);
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
