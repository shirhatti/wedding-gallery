/**
 * Generate thumbnails and upload them to R2
 * Supports both images and videos
 */

import { unstable_dev } from 'wrangler';
import { execSync } from 'child_process';
import { generateThumbnails, uploadThumbnails } from './lib/thumbnail-generator.mjs';

const DRY_RUN = !process.argv.includes('--generate');
const FORCE_REGENERATE = process.argv.includes('--force');
const USE_REMOTE = process.argv.includes('--remote');

async function main() {
  console.log('Starting worker...');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE: Will only show what would be generated');
    console.log('   Run with --generate to actually create thumbnails');
    console.log('   Add --force to regenerate all thumbnails');
    console.log('   Add --remote to use remote bindings\n');
  } else {
    console.log(FORCE_REGENERATE ? '🔄 Force regenerate mode: Regenerating ALL thumbnails' : '📸 Generate mode: Creating missing thumbnails');
    console.log(USE_REMOTE ? '☁️  Using remote bindings' : '💻 Using local bindings');
  }

  const worker = await unstable_dev('scripts/process-locally.ts', {
    config: 'scripts/wrangler-process-locally.toml',
    experimental: { disableExperimentalWarning: true },
    local: !USE_REMOTE
  });

  try {
    // Get all media (images and videos) from database via worker API
    console.log('Fetching media list from database...');
    const mediaResp = await worker.fetch('http://localhost/list-media');
    const { media } = await mediaResp.json();

    console.log(`Found ${media.length} media items in database (images and videos)`);

    // List all existing thumbnails from R2 in one batch operation
    console.log('Fetching existing thumbnails from R2...');
    const thumbResp = await worker.fetch('http://localhost/list-thumbnails?prefix=thumbnails/medium/');
    const { keys: existingThumbs } = await thumbResp.json();
    const existingSet = new Set(existingThumbs.map(k => k.replace('thumbnails/medium/', '')));

    console.log(`Found ${existingSet.size} existing thumbnails`);
    console.log(`Checking ${media.length} media items against existing thumbnails...\n`);

    let toGenerate = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of media) {
      const key = row.key;
      const mediaType = row.type;

      // Check if thumbnails already exist (unless force mode)
      if (!FORCE_REGENERATE && existingSet.has(key)) {
        skipped++;
        if (DRY_RUN) {
          console.log(`[${toGenerate + skipped + failed + 1}/${media.length}] ⏭️  ${key} (thumbnails exist)`);
        } else {
          console.log(`[${toGenerate + skipped + failed + 1}/${media.length}] Skipping ${key} (thumbnails exist)`);
        }
        continue;
      }

      if (DRY_RUN) {
        toGenerate++;
        const typeIcon = mediaType === 'video' ? '🎬' : '📸';
        console.log(`[${toGenerate + skipped + failed + 1}/${media.length}] 📋 Would generate: ${key} ${typeIcon}`);
        continue;
      }

      try {
        const typeIcon = mediaType === 'video' ? '🎬' : '📸';
        console.log(`[${toGenerate + skipped + failed + 1}/${media.length}] Processing ${key} ${typeIcon}...`);

        // Download full media file from R2
        const mediaResp = await worker.fetch(`http://localhost/get-full?key=${encodeURIComponent(key)}`);
        if (!mediaResp.ok) {
          throw new Error('Failed to fetch full media file');
        }

        const arrayBuffer = await mediaResp.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Generate thumbnails (handles both images and videos)
        const thumbnails = await generateThumbnails(buffer, mediaType, key);

        // Upload thumbnails to R2
        await uploadThumbnails(worker, key, thumbnails);

        toGenerate++;
        console.log(`  ✓ Generated and uploaded thumbnails`);
      } catch (error) {
        console.error(`  ✗ Failed: ${error.message}`);
        failed++;
      }
    }

    console.log(`\nDone!`);
    if (DRY_RUN) {
      console.log(`Would generate: ${toGenerate}`);
      console.log(`Already exist: ${skipped}`);
      console.log(`\n💡 Run with --generate to create these thumbnails`);
    } else {
      console.log(`Generated: ${toGenerate}`);
      console.log(`Skipped: ${skipped}`);
      console.log(`Failed: ${failed}`);

      // Invalidate thumbnail cache if forced regeneration
      if (FORCE_REGENERATE && toGenerate > 0) {
        console.log('\n🔄 Invalidating thumbnail cache...');
        const newVersion = Date.now().toString();
        execSync(`npx wrangler kv key put --binding=CACHE_VERSION "thumbnail_version" "${newVersion}" --remote`, {
          cwd: 'workers/viewer',
          stdio: 'inherit'
        });
        console.log(`  ✓ Cache version updated to ${newVersion}`);
      }
    }

  } finally {
    await worker.stop();
  }
}

main().catch(console.error);
