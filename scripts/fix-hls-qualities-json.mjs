#!/usr/bin/env node
/**
 * Fix malformed JSON in hls_qualities field
 * Converts [1080p,720p,480p,360p] to ["1080p","720p","480p","360p"]
 */

import { execSync } from 'child_process';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

async function main() {
  console.log('Fetching all videos with hls_qualities from D1...');

  const result = execSync('npx wrangler d1 execute wedding-photos-metadata --command "SELECT key, hls_qualities FROM media WHERE hls_qualities IS NOT NULL" --json --remote --config workers/viewer/wrangler.toml', {
    cwd: rootDir,
    encoding: 'utf8',
    timeout: 60000
  });

  const data = JSON.parse(result);
  const videos = data[0]?.results || [];

  console.log(`Found ${videos.length} videos with hls_qualities\n`);

  let fixed = 0;
  let alreadyValid = 0;
  let failed = 0;

  for (const video of videos) {
    const key = video.key;
    const currentValue = video.hls_qualities;

    // Check if it's valid JSON
    let isValid = false;
    try {
      JSON.parse(currentValue);
      isValid = true;
    } catch (e) {
      // Not valid JSON
    }

    if (isValid) {
      console.log(`✓ ${key} - Already valid JSON`);
      alreadyValid++;
      continue;
    }

    // Fix malformed JSON by adding quotes
    const fixedValue = currentValue.replace(/\[([^\]]+)\]/g, (match, content) => {
      const items = content.split(',').map(s => `"${s.trim()}"`).join(',');
      return `[${items}]`;
    });

    // Verify the fix produces valid JSON
    try {
      JSON.parse(fixedValue);
    } catch (e) {
      console.log(`✗ ${key} - Failed to fix JSON: ${currentValue}`);
      failed++;
      continue;
    }

    console.log(`  Fixing: ${currentValue} -> ${fixedValue}`);

    // Update database
    const escapedKey = key.replace(/'/g, "''");
    try {
      execSync(`npx wrangler d1 execute wedding-photos-metadata --command "UPDATE media SET hls_qualities = '${fixedValue}' WHERE key = '${escapedKey}'" --remote --config workers/viewer/wrangler.toml`, {
        cwd: rootDir,
        stdio: 'pipe',
        timeout: 30000
      });
      console.log(`✓ ${key} - Fixed\n`);
      fixed++;
    } catch (error) {
      console.log(`✗ ${key} - Database update failed\n`);
      failed++;
    }
  }

  console.log(`\n========================================`);
  console.log(`JSON Fix Complete!`);
  console.log(`Already valid: ${alreadyValid}`);
  console.log(`Fixed: ${fixed}`);
  console.log(`Failed: ${failed}`);
  console.log(`========================================`);
}

main().catch(console.error);
