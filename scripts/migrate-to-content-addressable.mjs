/**
 * Migrate existing files to content-addressable storage (SHA-256 based keys)
 *
 * This script:
 * 1. Lists all files in R2 bucket
 * 2. Downloads and hashes each file
 * 3. Renames files to use hash-based keys ({hash}.{ext})
 * 4. Updates database records with new keys
 * 5. Moves thumbnails to match new keys
 * 6. Handles deduplication automatically
 *
 * Usage: node scripts/migrate-to-content-addressable.mjs [--dry-run]
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { createHash } from 'crypto';

const DRY_RUN = process.argv.includes('--dry-run');

if (DRY_RUN) {
  console.log('🔍 DRY RUN MODE - No changes will be made\n');
}

/**
 * Get MIME type to extension mapping
 */
const MIME_TO_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/x-matroska': 'mkv',
  'video/x-m4v': 'm4v',
};

/**
 * Hash file content
 */
function hashBuffer(buffer) {
  const hash = createHash('sha256');
  hash.update(buffer);
  return hash.digest('hex');
}

/**
 * List all files in R2 bucket
 */
function listR2Files() {
  try {
    const output = execSync(
      'npx wrangler r2 object list wedding-photos-metadata --remote',
      { cwd: 'workers/viewer', encoding: 'utf8' }
    );

    // Parse wrangler output - it returns JSON array of objects with key
    const files = [];
    const lines = output.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('Listing objects') && !trimmed.includes('├─') && !trimmed.includes('└─')) {
        // Extract key from wrangler output
        const match = trimmed.match(/^([^\s]+)/);
        if (match) {
          files.push(match[1]);
        }
      }
    }

    return files.filter(f =>
      !f.startsWith('thumbnails/') &&
      /\.(jpg|jpeg|png|gif|webp|mp4|webm|mov|avi|mkv|m4v)$/i.test(f)
    );
  } catch (error) {
    console.error('Failed to list R2 files:', error.message);
    return [];
  }
}

/**
 * Download file from R2
 */
function downloadFromR2(key) {
  const tempFile = `/tmp/migrate-${Date.now()}.tmp`;
  try {
    execSync(
      `npx wrangler r2 object get wedding-photos-metadata/${key} --file="${tempFile}" --remote`,
      { cwd: 'workers/viewer', stdio: 'pipe' }
    );
    const buffer = readFileSync(tempFile);
    unlinkSync(tempFile);
    return buffer;
  } catch (error) {
    throw new Error(`Failed to download ${key}: ${error.message}`);
  }
}

/**
 * Copy file in R2 (using get + put)
 */
function copyInR2(fromKey, toKey) {
  const tempFile = `/tmp/copy-${Date.now()}.tmp`;
  try {
    // Download
    execSync(
      `npx wrangler r2 object get wedding-photos-metadata/${fromKey} --file="${tempFile}" --remote`,
      { cwd: 'workers/viewer', stdio: 'pipe' }
    );

    // Upload with new key
    execSync(
      `npx wrangler r2 object put wedding-photos-metadata/${toKey} --file="${tempFile}" --remote`,
      { cwd: 'workers/viewer', stdio: 'pipe' }
    );

    unlinkSync(tempFile);
  } catch (error) {
    throw new Error(`Failed to copy ${fromKey} to ${toKey}: ${error.message}`);
  }
}

/**
 * Delete file from R2
 */
function deleteFromR2(key) {
  try {
    execSync(
      `npx wrangler r2 object delete wedding-photos-metadata/${key} --remote`,
      { cwd: 'workers/viewer', stdio: 'pipe' }
    );
  } catch (error) {
    console.error(`  ⚠ Failed to delete ${key}: ${error.message}`);
  }
}

/**
 * Check if file exists in R2
 */
function existsInR2(key) {
  try {
    execSync(
      `npx wrangler r2 object get wedding-photos-metadata/${key} --remote`,
      { cwd: 'workers/viewer', stdio: 'pipe' }
    );
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Safely escape SQL string values
 * Note: wrangler d1 execute doesn't support parameterized queries via --file
 * so we must use defensive escaping
 */
function escapeSqlString(str) {
  if (typeof str !== 'string') {
    throw new Error('SQL value must be a string');
  }

  // Escape single quotes by doubling them (SQL standard)
  // Also validate that the string doesn't contain other SQL-injection patterns
  const escaped = str.replace(/'/g, "''");

  // Defensive check: detect potential SQL injection attempts
  // Keys should not contain semicolons, comments, or other SQL syntax
  if (escaped.includes(';') || escaped.includes('--') || escaped.includes('/*') ||
      escaped.includes('*/') || escaped.includes('UNION') || escaped.includes('DROP')) {
    throw new Error(`Potentially unsafe SQL value detected: ${str.substring(0, 50)}`);
  }

  return `'${escaped}'`;
}

/**
 * Update database record
 */
function updateDatabaseKey(oldKey, newKey) {
  const sql = `
    UPDATE media SET key = ${escapeSqlString(newKey)}
    WHERE key = ${escapeSqlString(oldKey)};

    UPDATE pending_thumbnails SET key = ${escapeSqlString(newKey)}
    WHERE key = ${escapeSqlString(oldKey)};
  `;

  writeFileSync('/tmp/migrate.sql', sql);
  execSync(
    'npx wrangler d1 execute wedding-photos-metadata --file=/tmp/migrate.sql --remote',
    { cwd: 'workers/viewer', stdio: 'pipe' }
  );
}

/**
 * Get file extension from filename
 */
function getExtension(filename) {
  const match = filename.match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : 'jpg';
}

/**
 * Check if key is already hash-based (64 hex chars + extension)
 */
function isHashBasedKey(key) {
  return /^[0-9a-f]{64}\.[a-z0-9]+$/i.test(key);
}

async function main() {
  console.log('📋 Listing all files in R2...\n');
  const files = listR2Files();

  console.log(`Found ${files.length} media files to process\n`);

  let migrated = 0;
  let skipped = 0;
  let deduplicated = 0;
  let failed = 0;

  for (let i = 0; i < files.length; i++) {
    const oldKey = files[i];
    console.log(`[${i + 1}/${files.length}] Processing: ${oldKey}`);

    try {
      // Skip if already hash-based
      if (isHashBasedKey(oldKey)) {
        console.log('  ✓ Already using content-addressable key, skipping');
        skipped++;
        continue;
      }

      // Download and hash the file
      console.log('  → Downloading and hashing...');
      const buffer = downloadFromR2(oldKey);
      const hash = hashBuffer(buffer);
      const extension = getExtension(oldKey);
      const newKey = `${hash}.${extension}`;

      console.log(`  → New key: ${newKey}`);

      // Check if target already exists (deduplication)
      if (existsInR2(newKey)) {
        console.log('  ⊚ Target hash already exists (duplicate detected)');

        if (!DRY_RUN) {
          // Update database to point to existing hash
          updateDatabaseKey(oldKey, newKey);

          // Delete old file
          deleteFromR2(oldKey);

          // Move thumbnails
          ['small', 'medium', 'large'].forEach(size => {
            const oldThumbKey = `thumbnails/${size}/${oldKey}`;
            if (existsInR2(oldThumbKey)) {
              deleteFromR2(oldThumbKey);
              console.log(`  → Deleted duplicate thumbnail: ${oldThumbKey}`);
            }
          });
        }

        deduplicated++;
        console.log('  ✓ Deduplicated');
        continue;
      }

      // Rename file to new key
      if (!DRY_RUN) {
        console.log('  → Copying to new key...');
        copyInR2(oldKey, newKey);

        console.log('  → Updating database...');
        updateDatabaseKey(oldKey, newKey);

        console.log('  → Deleting old file...');
        deleteFromR2(oldKey);

        // Move thumbnails
        ['small', 'medium', 'large'].forEach(size => {
          const oldThumbKey = `thumbnails/${size}/${oldKey}`;
          const newThumbKey = `thumbnails/${size}/${newKey}`;

          if (existsInR2(oldThumbKey)) {
            console.log(`  → Moving thumbnail: ${size}`);
            copyInR2(oldThumbKey, newThumbKey);
            deleteFromR2(oldThumbKey);
          }
        });
      }

      migrated++;
      console.log('  ✓ Migrated successfully\n');

    } catch (error) {
      console.error(`  ✗ Failed: ${error.message}\n`);
      failed++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('Migration Summary');
  console.log('='.repeat(60));
  console.log(`Total files:        ${files.length}`);
  console.log(`Migrated:           ${migrated}`);
  console.log(`Deduplicated:       ${deduplicated}`);
  console.log(`Already migrated:   ${skipped}`);
  console.log(`Failed:             ${failed}`);
  console.log('='.repeat(60));

  if (DRY_RUN) {
    console.log('\n⚠️  This was a DRY RUN - no changes were made');
    console.log('Run without --dry-run to perform the migration');
  }
}

main().catch(console.error);
