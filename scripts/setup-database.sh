#!/bin/bash
set -e

echo "Setting up D1 database for wedding gallery..."

# Create D1 database
echo "Creating D1 database..."
DB_OUTPUT=$(npx wrangler d1 create wedding-photos-metadata)
echo "$DB_OUTPUT"

# Extract database ID from output
DATABASE_ID=$(echo "$DB_OUTPUT" | grep "database_id" | sed 's/.*database_id = "\(.*\)"/\1/')

if [ -z "$DATABASE_ID" ]; then
  echo "Error: Could not extract database ID"
  exit 1
fi

echo "Database ID: $DATABASE_ID"

# Update wrangler.toml with database ID
echo "Updating wrangler.toml with database ID..."
sed -i.bak "s/database_id = \"YOUR_DATABASE_ID\"/database_id = \"$DATABASE_ID\"/" workers/album/wrangler.toml
rm workers/album/wrangler.toml.bak

# Run migrations
echo "Running database migrations..."
npx wrangler d1 execute wedding-photos-metadata --file=schema.sql

echo "Database setup complete!"
echo "Database ID: $DATABASE_ID"
