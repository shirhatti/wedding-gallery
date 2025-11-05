/**
 * Sanitize existing filenames in the database
 *
 * This script updates the filename column in the media table to remove
 * any potentially dangerous characters from filenames that were uploaded
 * before sanitization was implemented.
 *
 * Usage: node scripts/sanitize-database-filenames.mjs [--dry-run]
 */

import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const DRY_RUN = process.argv.includes('--dry-run');

if (DRY_RUN) {
  console.log('🔍 DRY RUN MODE - No changes will be made\n');
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

/**
 * Safely escape SQL string values
 */
function escapeSqlString(str) {
  if (typeof str !== 'string') {
    throw new Error('SQL value must be a string');
  }

  const escaped = str.replace(/'/g, "''");

  // Defensive check for SQL injection attempts
  if (escaped.includes(';') || escaped.includes('--') || escaped.includes('/*') ||
      escaped.includes('*/') || escaped.includes('UNION') || escaped.includes('DROP')) {
    throw new Error(`Potentially unsafe SQL value detected: ${str.substring(0, 50)}`);
  }

  return `'${escaped}'`;
}

/**
 * Get all media records from the database
 */
function getAllMedia() {
  try {
    const output = execSync(
      `npx wrangler d1 execute wedding-photos-metadata --command="SELECT key, filename FROM media;" --remote --json`,
      { cwd: 'workers/viewer', encoding: 'utf8' }
    );

    const result = JSON.parse(output);
    if (result.success && result.results && result.results.length > 0) {
      return result.results[0].results || [];
    }
    return [];
  } catch (error) {
    console.error('Failed to fetch media records:', error.message);
    return [];
  }
}

/**
 * Update a filename in the database
 */
function updateFilename(key, newFilename) {
  const sql = `UPDATE media SET filename = ${escapeSqlString(newFilename)} WHERE key = ${escapeSqlString(key)};`;

  writeFileSync('/tmp/sanitize-filename.sql', sql);
  execSync(
    'npx wrangler d1 execute wedding-photos-metadata --file=/tmp/sanitize-filename.sql --remote',
    { cwd: 'workers/viewer', stdio: 'pipe' }
  );
}

async function main() {
  console.log('📋 Fetching all media records from database...\n');
  const media = getAllMedia();

  console.log(`Found ${media.length} media records to process\n`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < media.length; i++) {
    const record = media[i];
    const { key, filename } = record;

    console.log(`[${i + 1}/${media.length}] Processing: ${filename}`);

    try {
      const sanitized = sanitizeFilename(filename);

      // Check if sanitization changed the filename
      if (sanitized === filename) {
        console.log('  ✓ Already safe, skipping\n');
        skipped++;
        continue;
      }

      console.log(`  → Sanitized: ${sanitized}`);

      if (!DRY_RUN) {
        updateFilename(key, sanitized);
        console.log('  ✓ Updated in database\n');
      } else {
        console.log('  → Would update (dry run)\n');
      }

      updated++;

    } catch (error) {
      console.error(`  ✗ Failed: ${error.message}\n`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Sanitization Summary');
  console.log('='.repeat(60));
  console.log(`Total records:      ${media.length}`);
  console.log(`Updated:            ${updated}`);
  console.log(`Already safe:       ${skipped}`);
  console.log(`Failed:             ${failed}`);
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n⚠️  This was a DRY RUN - no changes were made');
    console.log('Run without --dry-run to perform the sanitization');
  }
}

main().catch(console.error);
