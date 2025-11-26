/**
 * Promote media from private to public bucket
 *
 * This script copies a media file and all its related assets (thumbnails, HLS segments)
 * from the private R2 bucket to the public R2 bucket.
 *
 * Usage: node scripts/make-public.mjs <key>
 *
 * Examples:
 *   node scripts/make-public.mjs 1758739736033-IMG_2797.jpeg
 *   node scripts/make-public.mjs Dances-002.mp4
 */

import { execSync } from 'child_process';

// Constants
const PRIVATE_BUCKET = 'wedding-photos';
const PUBLIC_BUCKET = 'wedding-photos-public';
const D1_DATABASE = 'wedding-photos-metadata';

// Input validation regex - matches timestamp-filename pattern (timestamp is optional)
const VALID_KEY_PATTERN = /^(\d+-)?[\w\-\.]+$/;

const key = process.argv[2];

if (!key) {
  console.error('Usage: node scripts/make-public.mjs <key>');
  console.error('');
  console.error('Examples:');
  console.error('  node scripts/make-public.mjs 1758739736033-IMG_2797.jpeg');
  console.error('  node scripts/make-public.mjs Dances-002.mp4');
  process.exit(1);
}

// Validate key format to prevent injection
if (!VALID_KEY_PATTERN.test(key)) {
  console.error('❌ Error: Invalid key format. Expected format: <timestamp>-<filename> or <filename>');
  console.error(`   Got: ${key}`);
  process.exit(1);
}

console.log(`Promoting to public bucket: ${key}\n`);

try {
  // 1. Check if media exists in D1
  console.log('1. Checking if media exists in database...');
  const checkSql = `SELECT key, type FROM media WHERE key = '${key}';`;

  const result = execSync(`npx wrangler d1 execute ${D1_DATABASE} --remote --command "${checkSql}"`, {
    cwd: 'workers/viewer',
    encoding: 'utf-8'
  });

  // Parse the output - wrangler prints info text, then JSON array
  // Find where the JSON starts (first '[' character)
  const jsonStart = result.indexOf('[');
  if (jsonStart === -1) {
    throw new Error('Failed to find JSON in wrangler output');
  }
  const jsonText = result.substring(jsonStart);
  const parsed = JSON.parse(jsonText);
  const media = parsed[0]?.results?.[0];

  if (!media) {
    console.error(`❌ Error: Media with key "${key}" not found in database`);
    process.exit(1);
  }

  const isVideo = media.type === 'video';
  console.log(`   ✓ Found ${isVideo ? 'video' : 'image'}: ${key}`);

  // 2. Check if file exists in private bucket (may not exist if only HLS is stored)
  console.log('\n2. Checking private bucket...');
  let originalExists = false;
  try {
    execSync(`npx wrangler r2 object get ${PRIVATE_BUCKET}/${key} --remote --file=/dev/null`, {
      cwd: 'workers/viewer',
      stdio: 'pipe'
    });
    originalExists = true;
    console.log(`   ✓ Original file exists in private bucket`);
  } catch (error) {
    console.log(`   ⊘ Original file not found (HLS-only video)`);
  }

  // 3. Copy original file (if it exists)
  if (originalExists) {
    console.log('\n3. Copying original file to public bucket...');
    execSync(`npx wrangler r2 object get ${PRIVATE_BUCKET}/${key} --remote --file=/tmp/${key.replace(/\//g, '_')}`, {
      cwd: 'workers/viewer',
      stdio: 'pipe'
    });
    execSync(`npx wrangler r2 object put ${PUBLIC_BUCKET}/${key} --remote --file=/tmp/${key.replace(/\//g, '_')}`, {
      cwd: 'workers/viewer',
      stdio: 'pipe'
    });
    console.log(`   ✓ Copied: ${key}`);
  } else {
    console.log('\n3. Skipping original file (not found)');
  }

  // 4. Copy thumbnails (all sizes)
  console.log('\n4. Copying thumbnails...');
  const thumbnailSizes = ['small', 'medium', 'large'];
  for (const size of thumbnailSizes) {
    const thumbnailKey = `thumbnails/${size}/${key}`;
    try {
      execSync(`npx wrangler r2 object get ${PRIVATE_BUCKET}/${thumbnailKey} --remote --file=/tmp/thumb_${size}`, {
        cwd: 'workers/viewer',
        stdio: 'pipe'
      });
      execSync(`npx wrangler r2 object put ${PUBLIC_BUCKET}/${thumbnailKey} --remote --file=/tmp/thumb_${size}`, {
        cwd: 'workers/viewer',
        stdio: 'pipe'
      });
      console.log(`   ✓ Copied: ${thumbnailKey}`);
    } catch (error) {
      console.log(`   ⊘ Skipped: ${thumbnailKey} (not found)`);
    }
  }

  // 5. If video, copy HLS files
  if (isVideo) {
    console.log('\n5. Copying HLS files...');
    const hlsPrefix = `hls/${key}`;

    console.log(`   Copying all HLS files for ${hlsPrefix}/...`);

    let copiedCount = 0;

    // Step 1: Copy master.m3u8
    const masterPath = `${hlsPrefix}/master.m3u8`;
    try {
      execSync(`npx wrangler r2 object get ${PRIVATE_BUCKET}/${masterPath} --remote --file=/tmp/master.m3u8`, {
        cwd: 'workers/viewer',
        stdio: 'pipe'
      });
      execSync(`npx wrangler r2 object put ${PUBLIC_BUCKET}/${masterPath} --remote --file=/tmp/master.m3u8`, {
        cwd: 'workers/viewer',
        stdio: 'pipe'
      });
      console.log(`   ✓ Copied: ${masterPath}`);
      copiedCount++;

      // Step 2: Parse master.m3u8 to find variant playlists
      const masterContent = execSync('cat /tmp/master.m3u8', { encoding: 'utf-8' });
      const variantPlaylists = masterContent
        .split('\n')
        .filter(line => line.endsWith('.m3u8'))
        .map(line => line.trim());

      console.log(`   Found ${variantPlaylists.length} variant playlists`);

      // Step 3: For each variant playlist, copy it and its segments
      for (const variantFile of variantPlaylists) {
        const variantPath = `${hlsPrefix}/${variantFile}`;

        try {
          // Copy variant playlist
          const safeVariantName = variantFile.replace(/\//g, '_');
          execSync(`npx wrangler r2 object get ${PRIVATE_BUCKET}/${variantPath} --remote --file=/tmp/${safeVariantName}`, {
            cwd: 'workers/viewer',
            stdio: 'pipe'
          });
          execSync(`npx wrangler r2 object put ${PUBLIC_BUCKET}/${variantPath} --remote --file=/tmp/${safeVariantName}`, {
            cwd: 'workers/viewer',
            stdio: 'pipe'
          });
          console.log(`   ✓ Copied: ${variantPath}`);
          copiedCount++;

          // Step 4: Parse variant playlist to find segment files
          const variantContent = execSync(`cat /tmp/${safeVariantName}`, { encoding: 'utf-8' });
          const segments = variantContent
            .split('\n')
            .filter(line => line.endsWith('.ts'))
            .map(line => line.trim());

          console.log(`   Found ${segments.length} segments for ${variantFile}`);

          // Step 5: Copy all segments
          for (const segment of segments) {
            const segmentPath = `${hlsPrefix}/${segment}`;
            const safeSegmentName = segment.replace(/\//g, '_');

            try {
              execSync(`npx wrangler r2 object get ${PRIVATE_BUCKET}/${segmentPath} --remote --file=/tmp/${safeSegmentName}`, {
                cwd: 'workers/viewer',
                stdio: 'pipe'
              });
              execSync(`npx wrangler r2 object put ${PUBLIC_BUCKET}/${segmentPath} --remote --file=/tmp/${safeSegmentName}`, {
                cwd: 'workers/viewer',
                stdio: 'pipe'
              });
              copiedCount++;
              execSync(`rm -f /tmp/${safeSegmentName}`, { stdio: 'pipe' });
            } catch (error) {
              console.log(`   ⊘ Failed to copy segment: ${segmentPath}`);
            }
          }

          console.log(`   ✓ Copied all segments for ${variantFile}`);
          execSync(`rm -f /tmp/${safeVariantName}`, { stdio: 'pipe' });
        } catch (error) {
          console.log(`   ⊘ Variant playlist not found: ${variantPath}`);
        }
      }

      execSync('rm -f /tmp/master.m3u8', { stdio: 'pipe' });
    } catch (error) {
      console.log(`   ⊘ Master playlist not found: ${masterPath}`);
    }

    console.log(`   ✓ Total HLS files copied: ${copiedCount}`);
  }

  // 6. Update public manifest
  console.log('\n6. Updating public manifest...');

  const MANIFEST_KEY = '_metadata/public-manifest.json';
  const PUBLIC_BUCKET_URL = 'https://media.jessandsourabh.com';

  // Fetch existing manifest from public bucket
  let manifest = { media: [] };
  try {
    execSync(`npx wrangler r2 object get ${PUBLIC_BUCKET}/${MANIFEST_KEY} --remote --file=/tmp/manifest.json`, {
      cwd: 'workers/viewer',
      stdio: 'pipe'
    });
    const manifestContent = execSync('cat /tmp/manifest.json', { encoding: 'utf-8' });
    manifest = JSON.parse(manifestContent);
    console.log(`   Found existing manifest with ${manifest.media.length} items`);
  } catch (error) {
    console.log(`   No existing manifest found, creating new one`);
  }

  // Add or update this media item in manifest
  const existingIndex = manifest.media.findIndex(item => item.key === key);
  const mediaEntry = {
    key: media.key,
    name: media.key,
    size: 0,
    type: media.type,
    uploadedAt: new Date().toISOString(),
    dateTaken: null,
    cameraMake: null,
    cameraModel: null,
    urls: {
      thumbnailMedium: `${PUBLIC_BUCKET_URL}/thumbnails/medium/${key}`,
      original: `${PUBLIC_BUCKET_URL}/${key}`,
    }
  };

  if (existingIndex >= 0) {
    manifest.media[existingIndex] = mediaEntry;
    console.log(`   Updated existing entry in manifest`);
  } else {
    manifest.media.push(mediaEntry);
    console.log(`   Added new entry to manifest`);
  }

  // Write updated manifest to temp file
  const fs = await import('fs');
  fs.writeFileSync('/tmp/manifest-updated.json', JSON.stringify(manifest, null, 2));

  // Upload manifest to public bucket
  execSync(`npx wrangler r2 object put ${PUBLIC_BUCKET}/${MANIFEST_KEY} --remote --file=/tmp/manifest-updated.json --content-type=application/json`, {
    cwd: 'workers/viewer',
    stdio: 'pipe'
  });
  console.log(`   ✓ Manifest updated (${manifest.media.length} total items)`);

  // Cleanup temp files
  execSync('rm -f /tmp/thumb_* /tmp/hls_* /tmp/*.mp4 /tmp/manifest.json /tmp/manifest-updated.json', { stdio: 'pipe' });

  console.log(`\n✅ Successfully promoted to public: ${key}`);
  console.log(`\nThe item is now available in the public gallery at:`);
  console.log(`  https://jessandsourabh.com/${isVideo ? 'videos' : 'images'}`);

} catch (error) {
  console.error(`\n❌ Error: ${error.message}`);
  if (error.stderr) {
    console.error(error.stderr.toString());
  }
  process.exit(1);
}
