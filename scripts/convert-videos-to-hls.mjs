/**
 * Convert videos to HLS format for adaptive streaming
 * Processes all videos in the database that don't have HLS versions yet
 */

import { unstable_dev } from 'wrangler';
import { execSync } from 'child_process';
import { rm } from 'fs/promises';
import { convertToHLS, uploadHLSToR2 } from './lib/hls-converter.mjs';

const DRY_RUN = !process.argv.includes('--convert');
const FORCE_RECONVERT = process.argv.includes('--force');

async function main() {
  console.log('Starting worker...');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE: Will only show what would be converted');
    console.log('   Run with --convert to actually create HLS files');
    console.log('   Add --force to reconvert all videos\n');
  } else {
    console.log(FORCE_RECONVERT ? '🔄 Force reconvert mode: Reconverting ALL videos' : '🎬 Convert mode: Creating HLS for videos without it');
  }

  const worker = await unstable_dev('scripts/process-locally.ts', {
    config: 'scripts/wrangler-process-locally.toml',
    experimental: { disableExperimentalWarning: true },
    local: false
  });

  try {
    // Query videos from D1
    console.log('Fetching videos from D1...');
    const result = execSync('npx wrangler d1 execute wedding-photos-metadata --command "SELECT key, filename FROM media WHERE type = \'video\'" --json --remote', {
      cwd: 'workers/viewer',
      encoding: 'utf8',
      stdio: ['inherit', 'pipe', 'inherit']
    });

    const data = JSON.parse(result);
    const videos = data[0]?.results || [];

    console.log(`Found ${videos.length} videos in database`);

    // List existing HLS conversions by checking for master playlists
    console.log('Checking for existing HLS conversions in R2...');
    const hlsResp = await worker.fetch('http://localhost/list-thumbnails?prefix=hls/');
    const { keys: existingHLS } = await hlsResp.json();

    // Extract video keys that have HLS (those with master.m3u8)
    const existingSet = new Set(
      existingHLS
        .filter(k => k.endsWith('/master.m3u8'))
        .map(k => k.replace('hls/', '').replace('/master.m3u8', ''))
    );

    console.log(`Found ${existingSet.size} existing HLS conversions`);
    console.log(`Checking ${videos.length} videos...\n`);

    let toConvert = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of videos) {
      const key = row.key;

      // Check if HLS already exists (unless force mode)
      if (!FORCE_RECONVERT && existingSet.has(key)) {
        skipped++;
        if (DRY_RUN) {
          console.log(`[${toConvert + skipped + failed + 1}/${videos.length}] ⏭️  ${key} (HLS exists)`);
        } else {
          console.log(`[${toConvert + skipped + failed + 1}/${videos.length}] Skipping ${key} (HLS exists)`);
        }
        continue;
      }

      if (DRY_RUN) {
        toConvert++;
        console.log(`[${toConvert + skipped + failed + 1}/${videos.length}] 📋 Would convert: ${key}`);
        continue;
      }

      let outputDir;
      try {
        console.log(`[${toConvert + skipped + failed + 1}/${videos.length}] Converting ${key} to HLS...`);

        // Download video from R2
        const videoResp = await worker.fetch(`http://localhost/get-full?key=${encodeURIComponent(key)}`);
        if (!videoResp.ok) {
          throw new Error('Failed to fetch video');
        }

        const arrayBuffer = await videoResp.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Convert to HLS
        const { outputDir: hlsOutputDir, qualityLevels } = await convertToHLS(buffer);
        outputDir = hlsOutputDir;

        // Upload HLS files to R2 using wrangler CLI
        console.log(`  Uploading HLS files to R2...`);
        await uploadHLSToR2(key, outputDir);

        toConvert++;
        console.log(`  ✓ Converted to HLS (${qualityLevels.join(', ')})`);
      } catch (error) {
        console.error(`  ✗ Failed: ${error.message}`);
        failed++;
      } finally {
        // Clean up temp directory
        if (outputDir) {
          await rm(outputDir, { recursive: true }).catch(() => {});
        }
      }
    }

    console.log(`\nDone!`);
    if (DRY_RUN) {
      console.log(`Would convert: ${toConvert}`);
      console.log(`Already have HLS: ${skipped}`);
      console.log(`\n💡 Run with --convert to create HLS versions`);
    } else {
      console.log(`Converted: ${toConvert}`);
      console.log(`Skipped: ${skipped}`);
      console.log(`Failed: ${failed}`);
    }

  } finally {
    await worker.stop();
  }
}

main().catch(console.error);
