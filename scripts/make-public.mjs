/**
 * Promote a video or image from private to public
 *
 * This script updates the database to mark media as public.
 * The is_public flag controls access permissions in the application.
 *
 * Usage: node scripts/make-public.mjs <key>
 *
 * Examples:
 *   node scripts/make-public.mjs 1758739736033-IMG_2797.jpeg
 *   node scripts/make-public.mjs Dances-002.mp4
 */

import { execSync } from 'child_process';

// Constants
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

console.log(`Promoting to public: ${key}\n`);

try {
  // 1. Check if media exists in D1
  console.log('1. Checking if media exists in database...');
  // Safe to use key directly since it's validated against VALID_KEY_PATTERN
  const checkSql = `SELECT key, type, is_public FROM media WHERE key = '${key}';`;
  const checkSqlFile = '/tmp/check.sql';
  execSync(`cat > ${checkSqlFile} << 'EOF'\n${checkSql}\nEOF`, { stdio: 'pipe' });

  const result = execSync(`npx wrangler d1 execute ${D1_DATABASE} --file=${checkSqlFile} --remote --json`, {
    cwd: 'workers/viewer',
    encoding: 'utf-8'
  });

  // Extract JSON from wrangler output (skip formatting lines)
  const jsonMatch = result.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Failed to parse wrangler output');
  }
  const parsed = JSON.parse(jsonMatch[0]);
  const media = parsed[0]?.results?.[0];

  if (!media) {
    console.error(`❌ Error: Media with key "${key}" not found in database`);
    process.exit(1);
  }

  const isVideo = media.type === 'video';
  console.log(`   ✓ Found ${isVideo ? 'video' : 'image'}: ${key}`);

  // 2. Check if already public
  if (media.is_public === 1) {
    console.log('\n❌ Error: This item is already public');
    process.exit(1);
  }

  // 3. Update D1 database to mark as public
  console.log('\n2. Updating database...');
  // Safe to use key directly since it's validated
  const updateSql = `UPDATE media SET is_public = 1 WHERE key = '${key}';`;
  const updateSqlFile = '/tmp/update.sql';
  execSync(`cat > ${updateSqlFile} << 'EOF'\n${updateSql}\nEOF`, { stdio: 'pipe' });

  execSync(`npx wrangler d1 execute ${D1_DATABASE} --file=${updateSqlFile} --remote`, {
    cwd: 'workers/viewer',
    stdio: 'pipe'
  });
  console.log('   ✓ Updated database - marked as public');

  console.log(`\n✅ Successfully promoted to public: ${key}`);
  console.log(`\nThe item can now be accessed at deep links like:`);
  console.log(`  /${isVideo ? 'video' : 'image'}/${key}`);

} catch (error) {
  console.error(`\n❌ Error: ${error.message}`);
  console.error(error.stack);
  process.exit(1);
}
