#!/usr/bin/env node
/**
 * Reconvert videos that lost quality
 * Deletes old HLS files and reconverts with native quality preserved
 */

import { unstable_dev } from 'wrangler';
import { execSync } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { rm } from 'fs/promises';
import { convertToHLS, uploadHLSToR2 } from './lib/hls-converter.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const STANDARD_RESOLUTIONS = [1080, 720, 480, 360];

async function main() {
  console.log('Starting worker...');

  const worker = await unstable_dev(resolve(__dirname, 'process-locally.ts'), {
    config: resolve(__dirname, 'wrangler-process-locally.toml'),
    experimental: { disableExperimentalWarning: true },
    local: false
  });

  try {
    console.log('Fetching videos with quality loss...');

    const result = execSync('npx wrangler d1 execute wedding-photos-metadata --command "SELECT key, height, hls_qualities FROM media WHERE type = \'video\' AND height IS NOT NULL AND hls_qualities IS NOT NULL" --json --remote --config workers/viewer/wrangler.toml', {
      cwd: rootDir,
      encoding: 'utf8'
    });

    const data = JSON.parse(result);
    const videos = data[0]?.results || [];

    const toReconvert = [];

    for (const video of videos) {
      const sourceHeight = video.height;

      // Handle both valid JSON and malformed JSON
      let qualities;
      try {
        qualities = JSON.parse(video.hls_qualities);
      } catch (e) {
        const fixed = video.hls_qualities.replace(/\[([^\]]+)\]/g, (match, content) => {
          const items = content.split(',').map(s => `"${s.trim()}"`).join(',');
          return `[${items}]`;
        });
        qualities = JSON.parse(fixed);
      }

      const isNonStandard = !STANDARD_RESOLUTIONS.includes(sourceHeight);

      if (isNonStandard) {
        const nativeQuality = `${sourceHeight}p`;
        const hasNativeQuality = qualities.includes(nativeQuality);

        if (!hasNativeQuality) {
          toReconvert.push(video.key);
        }
      }
    }

    console.log(`Found ${toReconvert.length} videos that need reconversion\n`);

    if (toReconvert.length === 0) {
      console.log('✓ No videos need reconversion!');
      return;
    }

    let reconverted = 0;
    let failed = 0;

    for (const key of toReconvert) {
      let outputDir;
      try {
        console.log(`[${reconverted + failed + 1}/${toReconvert.length}] Reconverting ${key}...`);

        // Delete old HLS files from R2
        console.log(`  Deleting old HLS files...`);
        const listUrl = `http://localhost/list-thumbnails?prefix=hls/${encodeURIComponent(key)}/`;
        const listResp = await worker.fetch(listUrl);
        const { keys } = await listResp.json();

        for (const hlsKey of keys) {
          const escapedKey = hlsKey.replace(/'/g, "\\'").replace(/"/g, '\\"');
          execSync(`npx wrangler r2 object delete "wedding-photos/${escapedKey}" --remote`, {
            cwd: 'workers/viewer',
            stdio: 'inherit'
          });
        }

        // Download video from R2
        console.log(`  Downloading video...`);
        const videoResp = await worker.fetch(`http://localhost/get-full?key=${encodeURIComponent(key)}`);
        if (!videoResp.ok) {
          throw new Error('Failed to fetch video');
        }

        const arrayBuffer = await videoResp.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Convert to HLS with new logic (preserves native resolution)
        console.log(`  Converting to HLS...`);
        const { outputDir: hlsOutputDir, qualityLevels } = await convertToHLS(buffer);
        outputDir = hlsOutputDir;

        // Upload HLS files to R2
        console.log(`  Uploading HLS files to R2...`);
        await uploadHLSToR2(key, outputDir);

        // Update database with new quality levels
        const qualitiesJson = JSON.stringify(qualityLevels);
        const escapedKey = key.replace(/'/g, "''");
        execSync(`npx wrangler d1 execute wedding-photos-metadata --command "UPDATE media SET hls_qualities = '${qualitiesJson}' WHERE key = '${escapedKey}'" --remote`, {
          cwd: 'workers/viewer',
          stdio: 'inherit'
        });

        console.log(`  ✓ Reconverted (${qualityLevels.join(', ')})\n`);
        reconverted++;
      } catch (error) {
        console.error(`  ✗ Failed: ${error.message}\n`);
        failed++;
      } finally {
        if (outputDir) {
          await rm(outputDir, { recursive: true }).catch(() => {});
        }
      }
    }

    console.log(`\n========================================`);
    console.log(`Reconversion complete!`);
    console.log(`Reconverted: ${reconverted}`);
    console.log(`Failed: ${failed}`);
    console.log(`========================================`);

  } finally {
    await worker.stop();
  }
}

main().catch(console.error);
