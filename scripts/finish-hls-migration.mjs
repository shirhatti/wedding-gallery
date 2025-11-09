#!/usr/bin/env node
/**
 * Finish HLS qualities migration for remaining videos
 */

import { unstable_dev } from 'wrangler';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

async function main() {
  console.log('Starting worker...');

  const worker = await unstable_dev(resolve(__dirname, 'process-locally.ts'), {
    config: resolve(__dirname, 'wrangler-process-locally.toml'),
    experimental: { disableExperimentalWarning: true },
    local: false
  });

  try {
    // Query videos with NULL hls_qualities
    console.log('Fetching videos with NULL hls_qualities from D1...');
    const result = execSync('npx wrangler d1 execute wedding-photos-metadata --command "SELECT key FROM media WHERE type = \'video\' AND hls_qualities IS NULL" --json --remote --config workers/viewer/wrangler.toml', {
      cwd: rootDir,
      encoding: 'utf8'
    });

    const data = JSON.parse(result);
    const videos = data[0]?.results || [];

    console.log(`Found ${videos.length} videos with NULL hls_qualities\n`);

    if (videos.length === 0) {
      console.log('✓ All videos already migrated!');
      return;
    }

    const qualityPresets = ['1080p', '720p', '480p', '360p'];
    let updated = 0;
    let noHls = 0;

    for (const row of videos) {
      const key = row.key;
      console.log(`Checking ${key}...`);

      // Check which quality levels exist in R2
      const availableQualities = [];

      for (const quality of qualityPresets) {
        const checkUrl = `http://localhost/head-object?key=${encodeURIComponent(`hls/${key}/${quality}.m3u8`)}`;
        const response = await worker.fetch(checkUrl);

        if (response.ok) {
          availableQualities.push(quality);
        }
      }

      if (availableQualities.length > 0) {
        console.log(`  Found qualities: ${availableQualities.join(', ')}`);

        // Update database
        const qualitiesJson = JSON.stringify(availableQualities);
        const escapedKey = key.replace(/'/g, "''");

        console.log(`  Updating database...`);
        execSync(`npx wrangler d1 execute wedding-photos-metadata --command "UPDATE media SET hls_qualities = '${qualitiesJson}' WHERE key = '${escapedKey}'" --remote --config workers/viewer/wrangler.toml`, {
          cwd: rootDir,
          encoding: 'utf8'
        });

        console.log(`  ✓ Updated database`);
        updated++;
      } else {
        console.log(`  ⚠ No HLS variants found - video needs to be transcoded`);
        noHls++;
      }
      console.log('');
    }

    console.log(`\n✓ Migration complete!`);
    console.log(`Updated: ${updated}`);
    console.log(`No HLS (needs transcoding): ${noHls}`);

  } finally {
    await worker.stop();
  }
}

main().catch(console.error);
