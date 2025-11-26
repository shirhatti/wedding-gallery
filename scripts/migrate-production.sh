#!/bin/bash
# Production Database Migration Script
# Usage: ./scripts/migrate-production.sh

set -e  # Exit on error

DB_NAME="wedding-photos-metadata"
MIGRATIONS_DIR="prisma/migrations"

echo "🔄 Migrating production D1 database: $DB_NAME"
echo ""

# Check if wrangler is authenticated
if ! npx wrangler whoami &> /dev/null; then
  echo "❌ Error: Not logged in to Wrangler. Run 'npx wrangler login' first."
  exit 1
fi

echo "📋 Found migrations:"
ls -1 "$MIGRATIONS_DIR" | grep -v "migration_lock.toml"
echo ""

read -p "⚠️  This will apply migrations to PRODUCTION. Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
  echo "❌ Migration cancelled"
  exit 0
fi

# Apply each migration in order
for migration_dir in "$MIGRATIONS_DIR"/*/; do
  migration_name=$(basename "$migration_dir")
  migration_file="$migration_dir/migration.sql"

  if [ -f "$migration_file" ]; then
    echo ""
    echo "📦 Applying migration: $migration_name"

    # Apply the migration
    npx wrangler d1 execute "$DB_NAME" \
      --remote \
      --file="$migration_file"

    if [ $? -eq 0 ]; then
      echo "   ✅ Successfully applied: $migration_name"
    else
      echo "   ❌ Failed to apply: $migration_name"
      exit 1
    fi
  fi
done

echo ""
echo "🎉 All migrations applied successfully!"
echo ""
echo "📊 Verifying database schema..."

# Verify the schema
npx wrangler d1 execute "$DB_NAME" \
  --remote \
  --command="PRAGMA table_info(media);" \
  --json

echo ""
echo "✅ Migration complete!"
