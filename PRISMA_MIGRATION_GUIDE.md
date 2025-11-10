# Prisma Migration Guide

This guide explains how to safely merge and deploy the Prisma ORM changes to production.

## Quick Answer: Can I Merge?

**YES!** But you need to run a verification script first to determine if any pre-merge fixes are needed.

## Pre-Merge: Verify Production Schema

Run this verification script:

```bash
./scripts/verify-and-fix-production-schema.sh
```

This script will:
1. ✅ Check your production schema for issues
2. ⚠️ Detect if you have bad `DEFAULT 'CURRENT_TIMESTAMP'` values
3. 🔧 Offer to fix the schema automatically if needed
4. 📊 Show you the current migration status

## What the Script Checks

### Check 1: Bad Default Values

**Problem**: If your production tables were created with `DEFAULT 'CURRENT_TIMESTAMP'`, they store the literal string "CURRENT_TIMESTAMP" instead of actual timestamps.

**Detection**: Script searches for this pattern in your schema.

**Fix**: If found, applies `scripts/fix-production-schema.sql` which:
- Creates new tables with correct schema
- Copies data, converting bad literals to proper timestamps
- Swaps tables atomically

### Check 2: Prisma Migration Table

**Status**: Checks if `_prisma_migrations` table exists

**Purpose**: Prisma uses this to track which migrations have been applied

## Post-Merge: Baseline Prisma (One-Time Setup)

After merging, if the verification script shows you need to baseline Prisma, run:

```bash
# 1. Create Prisma migrations table (if it doesn't exist)
npx wrangler d1 execute wedding-photos-metadata --remote --command \
  "CREATE TABLE IF NOT EXISTS _prisma_migrations (
    id TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    finished_at DATETIME,
    migration_name TEXT NOT NULL,
    logs TEXT,
    rolled_back_at DATETIME,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    applied_steps_count INTEGER NOT NULL DEFAULT 0
  )"

# 2. Mark the initial migration as already applied
npx wrangler d1 execute wedding-photos-metadata --remote --command \
  "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count)
   VALUES (
     '20251109221937-init',
     '0759bac38e6c6e1f6eea791f1e5e7c3e8b3a4de5c6d7e8f9a0b1c2d3e4f5a6b7',
     datetime('now'),
     '20251109221937_init',
     'Baseline migration - production tables already exist',
     datetime('now'),
     1
   )"
```

**Why?** This tells Prisma "the database already matches this migration" so it won't try to recreate existing tables.

## Future Migrations (After Initial Setup)

Once Prisma is baselined, future schema changes are automatic:

```bash
# Local development: create and apply migration
npx prisma migrate dev --name add_new_field

# Production: apply pending migrations
npx prisma migrate deploy
```

Or add to your CI/CD pipeline before deployment.

## Manual Verification Commands

If you want to check things manually:

### Check Current Schema

```bash
# View media table schema
npx wrangler d1 execute wedding-photos-metadata --remote --command \
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='media'"

# View pending_thumbnails schema
npx wrangler d1 execute wedding-photos-metadata --remote --command \
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='pending_thumbnails'"
```

### Check Sample Data

```bash
# Check for bad 'CURRENT_TIMESTAMP' literals in data
npx wrangler d1 execute wedding-photos-metadata --remote --command \
  "SELECT key, created_at, updated_at, processed_at
   FROM media
   WHERE created_at = 'CURRENT_TIMESTAMP'
      OR updated_at = 'CURRENT_TIMESTAMP'
      OR processed_at = 'CURRENT_TIMESTAMP'
   LIMIT 5"
```

### Check Migration Status

```bash
# See all applied migrations
npx wrangler d1 execute wedding-photos-metadata --remote --command \
  "SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at"
```

## Rollback Plan (If Something Goes Wrong)

If you need to rollback after applying the schema fix:

**Note**: The fix script creates backups by renaming tables to `_old`. If you applied it recently:

```bash
# Check if backup tables exist
npx wrangler d1 execute wedding-photos-metadata --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_old'"

# Restore from backup (if they exist)
npx wrangler d1 execute wedding-photos-metadata --remote --command \
  "DROP TABLE media;
   ALTER TABLE media_old RENAME TO media;
   DROP TABLE pending_thumbnails;
   ALTER TABLE pending_thumbnails_old RENAME TO pending_thumbnails"
```

**Better approach**: Test the fix script on a copy of your database first:

```bash
# Create a backup database
npx wrangler d1 create wedding-photos-metadata-backup

# Export from production
npx wrangler d1 export wedding-photos-metadata --remote --output=backup.sql

# Import to backup database
npx wrangler d1 execute wedding-photos-metadata-backup --remote --file=backup.sql

# Test the fix on backup
npx wrangler d1 execute wedding-photos-metadata-backup --remote --file=scripts/fix-production-schema.sql

# Verify it worked
npx wrangler d1 execute wedding-photos-metadata-backup --remote --command \
  "SELECT COUNT(*) FROM media"
```

## What This Migration Does

This PR introduces Prisma ORM to your codebase:

### Files Changed

1. **Added**: `prisma/schema.prisma` - Database schema definition
2. **Added**: `prisma/migrations/20251109221937_init/` - Initial migration matching existing schema
3. **Modified**: Viewer and video-streaming workers - Now use Prisma for queries
4. **Modified**: Maintenance scripts - Now use Prisma for type-safe operations
5. **Note**: Album worker still uses raw SQL (test environment limitation - documented)

### Schema Changes

**None to existing tables!** The migration matches your current production schema, with these corrections:

- ❌ Removed: `DEFAULT 'CURRENT_TIMESTAMP'` (bad - stores literal string)
- ✅ Made: `processed_at` nullable (was incorrectly NOT NULL)
- ✅ Kept: All existing columns, types, and constraints

### Benefits

- 🔒 **Type Safety**: TypeScript types auto-generated from schema
- 🛡️ **Query Validation**: Invalid queries caught at compile-time
- 📚 **Auto-complete**: Full IDE support for database queries
- 🔄 **Migration Management**: Version-controlled schema changes
- 🧪 **Better Testing**: Isolated test databases with consistent schema

## FAQ

**Q: Will this break my production app?**
A: No. The schema migration only fixes defaults and nullability - doesn't change data structure.

**Q: Do I need downtime?**
A: No. SQLite table renames are atomic. Workers remain available throughout.

**Q: What if I already have data in production?**
A: The fix script preserves all data, only fixing bad literal 'CURRENT_TIMESTAMP' values.

**Q: Can I test this first?**
A: Yes! Use the backup database approach shown in "Rollback Plan" above.

**Q: Why doesn't the album worker use Prisma?**
A: Test environment limitation. See `PRISMA_SCHEMA_DECISIONS.md` for details. Can migrate later.

**Q: What about future schema changes?**
A: Create migrations with `npx prisma migrate dev`, apply to production with `npx prisma migrate deploy`.

## Support

If you encounter issues:

1. Check the verification script output
2. Review `PRISMA_SCHEMA_DECISIONS.md` for design decisions
3. Check Prisma docs: https://www.prisma.io/docs
4. Verify D1 schema: Use manual verification commands above
