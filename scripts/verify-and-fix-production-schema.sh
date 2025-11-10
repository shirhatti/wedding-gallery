#!/bin/bash
set -e

echo "🔍 Checking production database schema..."

# Get current schema
SCHEMA=$(npx wrangler d1 execute wedding-photos-metadata --remote --command \
  "SELECT sql FROM sqlite_master WHERE type='table' AND name='media'" 2>&1)

echo ""
echo "Current media table schema:"
echo "$SCHEMA"
echo ""

# Check for bad defaults
if echo "$SCHEMA" | grep -q "DEFAULT 'CURRENT_TIMESTAMP'"; then
    echo "⚠️  WARNING: Found bad DEFAULT 'CURRENT_TIMESTAMP' in schema!"
    echo ""
    echo "Your production schema needs to be fixed before merging."
    echo ""
    read -p "Do you want to apply the fix now? (yes/no) " -n 3 -r
    echo
    if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        echo "🔧 Applying schema fix..."
        npx wrangler d1 execute wedding-photos-metadata --remote --file=scripts/fix-production-schema.sql
        echo "✅ Schema fixed!"
    else
        echo "❌ Fix cancelled. Please fix manually before merging."
        exit 1
    fi
else
    echo "✅ Schema looks good! No bad defaults found."
    echo ""
    echo "After merging, you just need to baseline Prisma:"
    echo ""
    echo "1. Create Prisma migrations table:"
    echo "   npx wrangler d1 execute wedding-photos-metadata --remote --command \\"
    echo "     \"CREATE TABLE IF NOT EXISTS _prisma_migrations (...)\""
    echo ""
    echo "2. Mark initial migration as applied:"
    echo "   npx wrangler d1 execute wedding-photos-metadata --remote --command \\"
    echo "     \"INSERT INTO _prisma_migrations (...)\""
    echo ""
fi

# Check if Prisma migrations table exists
echo ""
echo "🔍 Checking if Prisma migrations table exists..."
MIGRATIONS_TABLE=$(npx wrangler d1 execute wedding-photos-metadata --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table' AND name='_prisma_migrations'" 2>&1 || true)

if echo "$MIGRATIONS_TABLE" | grep -q "_prisma_migrations"; then
    echo "✅ Prisma migrations table already exists"

    # Check if our migration is already marked as applied
    MIGRATION_STATUS=$(npx wrangler d1 execute wedding-photos-metadata --remote --command \
      "SELECT migration_name FROM _prisma_migrations WHERE migration_name='20251109221937_init'" 2>&1 || true)

    if echo "$MIGRATION_STATUS" | grep -q "20251109221937_init"; then
        echo "✅ Initial migration already marked as applied"
        echo ""
        echo "🎉 You're all set! Safe to merge and deploy."
    else
        echo "⚠️  Prisma migrations table exists but initial migration not marked as applied"
        echo ""
        echo "After merging, run:"
        echo "  npx wrangler d1 execute wedding-photos-metadata --remote --command \\"
        echo "    \"INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count) \\"
        echo "    VALUES ('20251109221937-init', '0759bac38e6c6e1f6eea791f1e5e7c3e8b3a4de5c6d7e8f9a0b1c2d3e4f5a6b7', datetime('now'), '20251109221937_init', '', datetime('now'), 1)\""
    fi
else
    echo "ℹ️  Prisma migrations table doesn't exist yet (this is expected)"
    echo ""
    echo "After merging, you'll need to create it and baseline the migration."
fi
