/**
 * Upload photos to R2 and track them in D1 for thumbnail generation
 * Uses content-addressable storage (SHA-256) for automatic deduplication
 * Usage: node scripts/upload-photos.mjs <directory>
 */

import { readdirSync, statSync, writeFileSync, readFileSync } from 'fs';
import { join, extname } from 'path';
import { execSync } from 'child_process';
import { createHash } from 'crypto';
import exifr from 'exifr';

const PHOTOS_DIR = process.argv[2];

if (!PHOTOS_DIR) {
  console.error('Usage: node scripts/upload-photos.mjs <directory>');
  process.exit(1);
}

/**
 * Computes SHA-256 hash of file content for content-addressable storage
 */
function hashFile(filePath) {
  const fileBuffer = readFileSync(filePath);
  const hash = createHash('sha256');
  hash.update(fileBuffer);
  return hash.digest('hex');
}

/**
 * Check if file exists in R2 bucket
 */
function fileExistsInR2(key) {
  try {
    execSync(`npx wrangler r2 object get wedding-photos-metadata/${key} --remote`, {
      cwd: 'workers/viewer',
      stdio: 'pipe'
    });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Sanitizes a filename for safe database storage and display.
 * Removes dangerous characters while keeping the filename human-readable.
 */
function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'unknown';
  }

  // Extract the extension safely
  const lastDotIndex = filename.lastIndexOf('.');
  let baseName = filename;
  let extension = '';

  if (lastDotIndex > 0 && lastDotIndex < filename.length - 1) {
    baseName = filename.substring(0, lastDotIndex);
    extension = filename.substring(lastDotIndex + 1);
  }

  // Sanitize the base name
  baseName = baseName
    .replace(/\.\./g, '') // Remove parent directory references
    .replace(/[/\\]/g, '') // Remove path separators
    .replace(/[\x00-\x1f\x7f]/g, '') // Remove control characters
    .replace(/[<>:"|?*]/g, '') // Remove Windows-forbidden characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/\.+/g, '.') // Collapse multiple dots
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '') // Remove leading/trailing dots and spaces
    .substring(0, 200); // Limit length

  // Sanitize the extension
  extension = extension
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 10)
    .toLowerCase();

  // If the basename is empty after sanitization, use a default
  if (!baseName) {
    baseName = 'upload';
  }

  // Return the sanitized filename with extension
  return extension ? `${baseName}.${extension}` : baseName;
}

async function main() {
  // Get all image files
  const files = readdirSync(PHOTOS_DIR)
    .filter(f => /\.(jpg|jpeg|png|gif|webp)$/i.test(f))
    .map(f => join(PHOTOS_DIR, f));

  console.log(`Found ${files.length} images to upload\n`);

  let uploaded = 0;
  let failed = 0;

  for (const filePath of files) {
    const fileName = filePath.split('/').pop();
    const sanitizedFileName = sanitizeFilename(fileName);
    const fileHash = hashFile(filePath);
    const fileExt = extname(filePath).slice(1).toLowerCase() || 'jpg';
    const key = `${fileHash}.${fileExt}`;

    try {
      console.log(`[${uploaded + failed + 1}/${files.length}] Processing ${fileName}...`);

      const stats = statSync(filePath);

      // Check if file already exists (deduplication)
      const alreadyExists = fileExistsInR2(key);
      if (alreadyExists) {
        console.log(`  ⊚ File already exists (duplicate detected), skipping upload`);
      }

      // Extract EXIF
      let exif = null;
      try {
        exif = await exifr.parse(filePath, {
          pick: ['DateTimeOriginal', 'Make', 'Model', 'LensModel',
                 'FocalLength', 'FNumber', 'ExposureTime', 'ISO',
                 'latitude', 'longitude', 'GPSAltitude']
        });
      } catch (e) {
        console.log('  No EXIF data found');
      }

      // Upload to R2 only if it doesn't already exist
      if (!alreadyExists) {
        execSync(`npx wrangler r2 object put wedding-photos-metadata/${key} --file="${filePath}" --remote`, {
          cwd: 'workers/viewer',
          stdio: 'pipe'
        });
        console.log(`  ✓ Uploaded to R2 (key: ${key})`);
      }

      // Normalize EXIF values
      const normalize = (val) => {
        if (val === null || val === undefined) return null;
        if (typeof val === 'object') return null;
        return val;
      };

      const escape = (val) => val ? `'${String(val).replace(/'/g, "''")}'` : 'NULL';

      // Insert into media table
      const mediaSql = `
        INSERT OR REPLACE INTO media (
          key, filename, type, size, uploaded_at,
          date_taken, camera_make, camera_model, lens,
          focal_length, aperture, shutter_speed, iso,
          latitude, longitude, altitude,
          metadata, created_at, updated_at
        ) VALUES (
          ${escape(key)}, ${escape(sanitizedFileName)}, 'image', ${stats.size}, ${escape(new Date().toISOString())},
          ${escape(normalize(exif?.DateTimeOriginal))}, ${escape(normalize(exif?.Make))}, ${escape(normalize(exif?.Model))}, ${escape(normalize(exif?.LensModel))},
          ${normalize(exif?.FocalLength) || 'NULL'}, ${normalize(exif?.FNumber) || 'NULL'}, ${normalize(exif?.ExposureTime) || 'NULL'}, ${normalize(exif?.ISO) || 'NULL'},
          ${normalize(exif?.latitude) || 'NULL'}, ${normalize(exif?.longitude) || 'NULL'}, ${normalize(exif?.GPSAltitude) || 'NULL'},
          ${escape(exif ? JSON.stringify(exif) : null)}, ${escape(new Date().toISOString())}, ${escape(new Date().toISOString())}
        );
      `;

      // Insert into pending_thumbnails table (only for new files)
      const pendingSql = !alreadyExists ? `
        INSERT OR IGNORE INTO pending_thumbnails (key, created_at)
        VALUES (${escape(key)}, ${escape(new Date().toISOString())});
      ` : '';

      // Write SQL to temp file and execute
      writeFileSync('/tmp/upload.sql', mediaSql + '\n' + pendingSql);
      execSync('npx wrangler d1 execute wedding-photos-metadata --file=/tmp/upload.sql --remote', {
        cwd: 'workers/viewer',
        stdio: 'pipe'
      });

      uploaded++;
      console.log(`  ✓ Tracked in D1${!alreadyExists ? ' and queued for thumbnail generation' : ''}`);
      if (alreadyExists) {
        console.log(`  → Using content-addressable key: ${key}`);
      }
    } catch (error) {
      console.error(`  ✗ Failed: ${error.message}`);
      failed++;
    }
  }

  console.log(`\nDone!`);
  console.log(`Uploaded: ${uploaded}`);
  console.log(`Failed: ${failed}`);
}

main().catch(console.error);
