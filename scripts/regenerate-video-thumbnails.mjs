/**
 * Delete video thumbnails and regenerate them with correct aspect ratios
 */

import { unstable_dev } from 'wrangler';
import { execSync } from 'child_process';

async function main() {
  console.log('Starting worker...');

  const worker = await unstable_dev('scripts/process-locally.ts', {
    config: 'scripts/wrangler-process-locally.toml',
    experimental: { disableExperimentalWarning: true },
    local: false
  });

  try {
    // Get list of video thumbnails
    console.log('Fetching video thumbnail list from R2...');
    const thumbResp = await worker.fetch('http://localhost/list-thumbnails?prefix=thumbnails/');
    const { keys: allThumbs } = await thumbResp.json();

    // Get list of video keys from D1
    console.log('Fetching video keys from D1...');
    const result = execSync('npx wrangler d1 execute wedding-photos-metadata --command "SELECT key FROM media WHERE type = \'video\'" --json --remote', {
      cwd: 'workers/viewer',
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'inherit']
    });

    const data = JSON.parse(result);
    const videoKeys = data[0]?.results.map(r => r.key) || [];
    console.log(`Found ${videoKeys.length} videos in database`);

    // Filter thumbnails that belong to videos
    const videoThumbs = allThumbs.filter(thumb => {
      const key = thumb.replace(/^thumbnails\/(small|medium|large)\//, '');
      return videoKeys.includes(key);
    });

    console.log(`Found ${videoThumbs.length} video thumbnails to delete\n`);

    // Delete video thumbnails
    for (const thumb of videoThumbs) {
      console.log(`Deleting ${thumb}...`);
      execSync(`npx wrangler r2 object delete "wedding-photos/${thumb}" --remote`, {
        stdio: 'inherit'
      });
    }

    console.log('\n✓ Deleted all video thumbnails');

    // Add videos to pending queue
    console.log('\nAdding videos to pending queue...');
    const videoKeysEscaped = videoKeys.map(k => `'${k.replace(/'/g, "''")}'`).join(',');
    execSync(`npx wrangler d1 execute wedding-photos-metadata --command "INSERT OR IGNORE INTO pending_thumbnails (key) SELECT key FROM media WHERE key IN (${videoKeysEscaped})" --remote`, {
      cwd: 'workers/viewer',
      stdio: 'inherit'
    });

    console.log('✓ Videos added to pending queue');
    console.log('\nRun: node scripts/generate-thumbnails-from-pending.mjs');

  } finally {
    await worker.stop();
  }
}

main().catch(console.error);
