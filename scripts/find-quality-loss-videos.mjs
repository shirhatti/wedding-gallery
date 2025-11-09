#!/usr/bin/env node
/**
 * Find videos that lost quality due to downscaling to nearest preset
 * These are videos with non-standard resolutions (e.g., 540p) that were
 * converted to the nearest lower preset (480p) instead of preserving native quality
 */

import { execSync } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const STANDARD_RESOLUTIONS = [1080, 720, 480, 360];

async function main() {
  console.log('Fetching all videos from D1...');

  const result = execSync('npx wrangler d1 execute wedding-photos-metadata --command "SELECT key, height, hls_qualities FROM media WHERE type = \'video\' AND height IS NOT NULL AND hls_qualities IS NOT NULL" --json --remote --config workers/viewer/wrangler.toml', {
    cwd: rootDir,
    encoding: 'utf8'
  });

  const data = JSON.parse(result);
  const videos = data[0]?.results || [];

  console.log(`Found ${videos.length} videos with height and hls_qualities\n`);

  const needsReconversion = [];

  for (const video of videos) {
    const sourceHeight = video.height;

    // Handle both valid JSON and malformed JSON (e.g., [1080p,360p] vs ["1080p","360p"])
    let qualities;
    try {
      qualities = JSON.parse(video.hls_qualities);
    } catch (e) {
      // Try to fix malformed JSON by adding quotes
      const fixed = video.hls_qualities.replace(/\[([^\]]+)\]/g, (match, content) => {
        const items = content.split(',').map(s => `"${s.trim()}"`).join(',');
        return `[${items}]`;
      });
      qualities = JSON.parse(fixed);
    }

    // Check if source resolution is non-standard
    const isNonStandard = !STANDARD_RESOLUTIONS.includes(sourceHeight);

    if (isNonStandard) {
      // Check if native resolution is preserved
      const nativeQuality = `${sourceHeight}p`;
      const hasNativeQuality = qualities.includes(nativeQuality);

      if (!hasNativeQuality) {
        console.log(`❌ ${video.key}`);
        console.log(`   Source: ${sourceHeight}p, Available: ${qualities.join(', ')}`);
        console.log(`   Missing native ${nativeQuality} quality - NEEDS RECONVERSION\n`);
        needsReconversion.push(video.key);
      } else {
        console.log(`✓ ${video.key}`);
        console.log(`   Source: ${sourceHeight}p, Available: ${qualities.join(', ')}`);
        console.log(`   Has native quality\n`);
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`Summary:`);
  console.log(`Videos checked: ${videos.length}`);
  console.log(`Need reconversion: ${needsReconversion.length}`);
  console.log(`========================================\n`);

  if (needsReconversion.length > 0) {
    console.log(`Videos that need reconversion:`);
    needsReconversion.forEach(key => console.log(`  - ${key}`));
    console.log(`\nTo reconvert these videos, run:`);
    console.log(`node scripts/reconvert-quality-loss-videos.mjs`);
  } else {
    console.log(`✓ All videos have native quality preserved!`);
  }
}

main().catch(console.error);
