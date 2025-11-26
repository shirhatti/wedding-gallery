/**
 * List HLS files for a video to understand the structure
 */

import { Miniflare } from 'miniflare';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const key = process.argv[2];

if (!key) {
  console.error('Usage: npx tsx scripts/list-hls.ts <key>');
  process.exit(1);
}

const mf = new Miniflare({
  scriptPath: path.join(__dirname, '../workers/viewer/dist/index.js'),
  modules: true,
  r2Buckets: ['R2_BUCKET_PRIVATE', 'R2_BUCKET_PUBLIC'],
  r2Persist: true,
});

const bucket = await mf.getR2Bucket('R2_BUCKET_PRIVATE');
const hlsPrefix = `hls/${key}/`;

console.log(`Listing files with prefix: ${hlsPrefix}`);

const listed = await bucket.list({ prefix: hlsPrefix });

console.log(`\nFound ${listed.objects.length} HLS files:`);
for (const obj of listed.objects) {
  console.log(`  ${obj.key}`);
}

await mf.dispose();
