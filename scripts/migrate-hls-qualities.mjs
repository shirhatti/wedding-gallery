/**
 * Migrate existing videos to populate hls_qualities column
 * Checks R2 for available quality levels and updates database
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
    // Query all videos from D1
    console.log('Fetching videos from D1...');
    const result = execSync('npx wrangler d1 execute wedding-photos-metadata --command "SELECT key FROM media WHERE type = \'video\'" --json --remote --config workers/viewer/wrangler.toml', {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'inherit']
    });

    const data = JSON.parse(result);
    const videos = data[0]?.results || [];

    console.log(`Found ${videos.length} videos\n`);

    const qualityPresets = ['1080p', '720p', '480p', '360p'];
    let updated = 0;
    let skipped = 0;

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
        // Escape single quotes in the key for SQL
        const escapedKey = key.replace(/'/g, "''");
        execSync(`npx wrangler d1 execute wedding-photos-metadata --command "UPDATE media SET hls_qualities = '${qualitiesJson}' WHERE key = '${escapedKey}'" --remote --config workers/viewer/wrangler.toml`, {
          cwd: rootDir,
          stdio: 'inherit'
        });

        console.log(`  ✓ Updated database`);
        updated++;
      } else {
        console.log(`  No HLS qualities found`);
        skipped++;
      }
    }

    console.log(`\n✓ Migration complete!`);
    console.log(`Updated: ${updated}`);
    console.log(`Skipped (no HLS): ${skipped}`);

  } finally {
    await worker.stop();
  }
}

main().catch(console.error);
