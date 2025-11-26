/**
 * Promote a video or image from private to public
 *
 * This script:
 * 1. Copies R2 objects from private to public/ paths
 * 2. Updates the database with new key and isPublic flag
 * 3. Optionally deletes old private objects
 *
 * Usage: node scripts/make-public.mjs <key> [--keep-private]
 *
 * Examples:
 *   node scripts/make-public.mjs 1758739736033-IMG_2797.jpeg
 *   node scripts/make-public.mjs 1758739736033-video.mov --keep-private
 *
 * The --keep-private flag will keep the original private files as backup.
 */

import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import { PrismaD1 } from '@prisma/adapter-d1';

// Constants
const R2_BUCKET = 'wedding-photos';
const D1_DATABASE = 'wedding-photos-metadata';

// Input validation regex - matches timestamp-filename pattern
const VALID_KEY_PATTERN = /^\d+-[\w\-\.]+$/;

const key = process.argv[2];
const keepPrivate = process.argv.includes('--keep-private');

if (!key) {
  console.error('Usage: node scripts/make-public.mjs <key> [--keep-private]');
  console.error('');
  console.error('Examples:');
  console.error('  node scripts/make-public.mjs 1758739736033-IMG_2797.jpeg');
  console.error('  node scripts/make-public.mjs 1758739736033-video.mov --keep-private');
  process.exit(1);
}

// Validate key format to prevent injection
if (!VALID_KEY_PATTERN.test(key)) {
  console.error('❌ Error: Invalid key format. Expected format: <timestamp>-<filename>');
  console.error(`   Got: ${key}`);
  process.exit(1);
}

if (key.startsWith('public/')) {
  console.error('❌ Error: This item is already public');
  process.exit(1);
}

const publicKey = `public/${key}`;

console.log(`Promoting to public: ${key}`);
console.log(`New key will be: ${publicKey}\n`);

try {
  // 1. Check if media exists in D1
  console.log('1. Checking if media exists in database...');
  // Safe to use key directly since it's validated against VALID_KEY_PATTERN
  const checkSql = `SELECT key, type FROM media WHERE key = '${key}';`;
  const checkSqlFile = '/tmp/check.sql';
  execSync(`cat > ${checkSqlFile} << 'EOF'\n${checkSql}\nEOF`, { stdio: 'pipe' });

  const result = execSync(`npx wrangler d1 execute ${D1_DATABASE} --file=${checkSqlFile} --remote --json`, {
    cwd: 'workers/viewer',
    encoding: 'utf-8'
  });

  const parsed = JSON.parse(result);
  const media = parsed[0]?.results?.[0];

  if (!media) {
    console.error(`❌ Error: Media with key "${key}" not found in database`);
    process.exit(1);
  }

  const isVideo = media.type === 'video';
  console.log(`   ✓ Found ${isVideo ? 'video' : 'image'}: ${key}`);

  // 2. Copy main file
  console.log('\n2. Copying main file to public/ path...');
  execSync(`npx wrangler r2 object get ${R2_BUCKET}/${key} --file=/tmp/main-file --remote`, {
    cwd: 'workers/viewer',
    stdio: 'pipe'
  });
  execSync(`npx wrangler r2 object put ${R2_BUCKET}/${publicKey} --file=/tmp/main-file --remote`, {
    cwd: 'workers/viewer',
    stdio: 'pipe'
  });
  console.log(`   ✓ Copied ${key} → ${publicKey}`);

  // 3. Copy thumbnails
  console.log('\n3. Copying thumbnails to public/ path...');
  const thumbnailSizes = ['small', 'medium', 'large'];
  const baseFilename = key.replace(/\.[^/.]+$/, ''); // Remove extension for thumbnail naming

  for (const size of thumbnailSizes) {
    try {
      const privateThumbnail = `thumbnails/${size}/${baseFilename}_${size}.jpg`;
      const publicThumbnail = `thumbnails/public/${baseFilename}_${size}.jpg`;

      execSync(`npx wrangler r2 object get ${R2_BUCKET}/${privateThumbnail} --file=/tmp/thumbnail --remote`, {
        cwd: 'workers/viewer',
        stdio: 'pipe'
      });
      execSync(`npx wrangler r2 object put ${R2_BUCKET}/${publicThumbnail} --file=/tmp/thumbnail --remote`, {
        cwd: 'workers/viewer',
        stdio: 'pipe'
      });
      console.log(`   ✓ Copied ${size} thumbnail`);
    } catch (e) {
      console.log(`   ⚠ ${size} thumbnail not found (may not exist)`);
    }
  }

  // 4. Copy HLS files if video
  if (isVideo) {
    console.log('\n4. Copying HLS files to public/ path...');

    // List all HLS files for this video
    const hlsPrefix = `hls/${key}/`;
    const publicHlsPrefix = `hls/public/${key}/`;

    try {
      const listResult = execSync(`npx wrangler r2 object list ${R2_BUCKET} --prefix="${hlsPrefix}" --remote`, {
        cwd: 'workers/viewer',
        encoding: 'utf-8'
      });

      // Parse the list output to find all files
      const lines = listResult.split('\n');
      const hlsFiles = [];

      for (const line of lines) {
        if (line.includes(hlsPrefix) && !line.startsWith('Listing objects')) {
          // Extract the key from the wrangler output
          const match = line.match(/│\s+([^\s│]+)\s+│/);
          if (match && match[1].startsWith(hlsPrefix)) {
            hlsFiles.push(match[1]);
          }
        }
      }

      if (hlsFiles.length === 0) {
        console.log('   ⚠ No HLS files found (video may not be converted yet)');
      } else {
        console.log(`   Found ${hlsFiles.length} HLS files to copy...`);

        for (const hlsFile of hlsFiles) {
          const relativePath = hlsFile.substring(hlsPrefix.length);
          const publicHlsFile = `${publicHlsPrefix}${relativePath}`;

          execSync(`npx wrangler r2 object get ${R2_BUCKET}/${hlsFile} --file=/tmp/hls-file --remote`, {
            cwd: 'workers/viewer',
            stdio: 'pipe'
          });
          execSync(`npx wrangler r2 object put ${R2_BUCKET}/${publicHlsFile} --file=/tmp/hls-file --remote`, {
            cwd: 'workers/viewer',
            stdio: 'pipe'
          });
          console.log(`   ✓ Copied ${relativePath}`);
        }
      }
    } catch (e) {
      console.log('   ⚠ Error copying HLS files:', e.message);
    }
  }

  // 5. Update D1 database
  console.log('\n5. Updating database...');
  // Safe to use key and publicKey directly since they're validated
  const updateSql = `UPDATE media SET key = '${publicKey}', is_public = 1 WHERE key = '${key}';`;
  const updateSqlFile = '/tmp/update.sql';
  execSync(`cat > ${updateSqlFile} << 'EOF'\n${updateSql}\nEOF`, { stdio: 'pipe' });

  execSync(`npx wrangler d1 execute ${D1_DATABASE} --file=${updateSqlFile} --remote`, {
    cwd: 'workers/viewer',
    stdio: 'pipe'
  });
  console.log('   ✓ Updated database with new key and public flag');

  // 6. Optionally delete old private files
  if (!keepPrivate) {
    console.log('\n6. Deleting old private files...');

    // Delete main file
    try {
      execSync(`npx wrangler r2 object delete ${R2_BUCKET}/${key} --remote`, {
        cwd: 'workers/viewer',
        stdio: 'pipe'
      });
      console.log('   ✓ Deleted private main file');
    } catch (e) {
      console.log('   ⚠ Could not delete private main file');
    }

    // Delete thumbnails
    for (const size of thumbnailSizes) {
      try {
        const privateThumbnail = `thumbnails/${size}/${baseFilename}_${size}.jpg`;
        execSync(`npx wrangler r2 object delete ${R2_BUCKET}/${privateThumbnail} --remote`, {
          cwd: 'workers/viewer',
          stdio: 'pipe'
        });
        console.log(`   ✓ Deleted private ${size} thumbnail`);
      } catch (e) {
        // Silently ignore if thumbnail doesn't exist
      }
    }

    // Delete HLS files if video
    if (isVideo) {
      try {
        const hlsPrefix = `hls/${key}/`;
        const listResult = execSync(`npx wrangler r2 object list ${R2_BUCKET} --prefix="${hlsPrefix}" --remote`, {
          cwd: 'workers/viewer',
          encoding: 'utf-8'
        });

        const lines = listResult.split('\n');
        for (const line of lines) {
          const match = line.match(/│\s+([^\s│]+)\s+│/);
          if (match && match[1].startsWith(hlsPrefix)) {
            execSync(`npx wrangler r2 object delete ${R2_BUCKET}/${match[1]} --remote`, {
              cwd: 'workers/viewer',
              stdio: 'pipe'
            });
          }
        }
        console.log('   ✓ Deleted private HLS files');
      } catch (e) {
        console.log('   ⚠ Could not delete some HLS files');
      }
    }
  } else {
    console.log('\n6. Keeping private files (--keep-private flag set)');
  }

  console.log(`\n✅ Successfully promoted to public: ${publicKey}`);
  console.log(`\nThe item can now be accessed at deep links like:`);
  console.log(`  /${isVideo ? 'video' : 'image'}/${publicKey}`);

} catch (error) {
  console.error(`\n❌ Error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}
