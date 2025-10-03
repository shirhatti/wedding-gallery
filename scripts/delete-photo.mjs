/**
 * Delete a photo from R2 and D1
 * Usage: node scripts/delete-photo.mjs <url-or-key>
 *
 * Examples:
 *   node scripts/delete-photo.mjs https://viewer.shirhatti.workers.dev/api/file/1758739736033-IMG_2797.jpeg
 *   node scripts/delete-photo.mjs 1758739736033-IMG_2797.jpeg
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const input = process.argv[2];

if (!input) {
  console.error('Usage: node scripts/delete-photo.mjs <url-or-key>');
  console.error('');
  console.error('Examples:');
  console.error('  node scripts/delete-photo.mjs https://viewer.shirhatti.workers.dev/api/file/1758739736033-IMG_2797.jpeg');
  console.error('  node scripts/delete-photo.mjs 1758739736033-IMG_2797.jpeg');
  process.exit(1);
}

// Extract key from URL or use input directly
let key = input;
if (input.includes('/api/file/')) {
  key = input.split('/api/file/')[1];
} else if (input.includes('/api/thumbnail/')) {
  key = input.split('/api/thumbnail/')[1].split('?')[0];
}

console.log(`Deleting: ${key}\n`);

try {
  // Delete from R2: main file
  console.log('1. Deleting main file from R2...');
  try {
    execSync(`npx wrangler r2 object delete wedding-photos-metadata/${key} --remote`, {
      cwd: 'workers/viewer',
      stdio: 'pipe'
    });
    console.log('   ✓ Deleted main file');
  } catch (e) {
    console.log('   ⚠ Main file not found (may already be deleted)');
  }

  // Delete from R2: thumbnails
  console.log('2. Deleting thumbnails from R2...');
  const thumbnailSizes = ['small', 'medium', 'large'];
  for (const size of thumbnailSizes) {
    try {
      execSync(`npx wrangler r2 object delete wedding-photos-metadata/thumbnails/${size}/${key} --remote`, {
        cwd: 'workers/viewer',
        stdio: 'pipe'
      });
      console.log(`   ✓ Deleted ${size} thumbnail`);
    } catch (e) {
      console.log(`   ⚠ ${size} thumbnail not found`);
    }
  }

  // Delete from D1: media and pending_thumbnails tables
  console.log('3. Deleting from D1 database...');
  const escape = (val) => val ? `'${String(val).replace(/'/g, "''")}'` : 'NULL';

  const deleteSql = `
    DELETE FROM media WHERE key = ${escape(key)};
    DELETE FROM pending_thumbnails WHERE key = ${escape(key)};
  `;

  writeFileSync('/tmp/delete.sql', deleteSql);
  execSync('npx wrangler d1 execute wedding-photos-metadata --file=/tmp/delete.sql --remote', {
    cwd: 'workers/viewer',
    stdio: 'pipe'
  });
  console.log('   ✓ Deleted from database');

  console.log(`\n✅ Successfully deleted: ${key}`);
} catch (error) {
  console.error(`\n❌ Error: ${error.message}`);
  process.exit(1);
}
