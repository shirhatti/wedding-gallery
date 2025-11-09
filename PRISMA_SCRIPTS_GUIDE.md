# Prisma-Based Maintenance Scripts Guide

## Overview

The maintenance scripts have been migrated to use Prisma ORM for type-safe database operations. This provides better error checking, IDE autocomplete, and eliminates the need for raw SQL string manipulation.

---

## Architecture

### Local Development Workflow

```
┌─────────────────────┐
│  Prisma Scripts     │
│  (Node.js)          │
└──────────┬──────────┘
           │
           ├─── Prisma Client ─────> Local SQLite DB (prisma/dev.db)
           │
           └─── Wrangler Worker ───> R2 Bucket (for file access)
```

### Production Workflow

For production, you can:
1. **Option A**: Run scripts against local database, then sync to D1 using migrations
2. **Option B**: Export local database and import to D1
3. **Option C**: Use wrangler to execute individual SQL statements (legacy approach)

---

## Available Scripts

### 1. Extract All Dimensions (Prisma)

**File**: `scripts/extract-all-dimensions-prisma.mjs`

**Purpose**: Extract width/height dimensions for all media items in the database.

**Usage**:
```bash
node scripts/extract-all-dimensions-prisma.mjs
```

**What it does**:
1. Queries all media from local database using Prisma
2. Downloads each file from R2 via worker
3. Extracts dimensions using Sharp (images) or ffprobe (videos)
4. Updates database using type-safe Prisma operations
5. Batches updates for efficiency (50 items at a time)

**Prisma Operations Used**:
- `prisma.media.findMany()` - Query all media
- `prisma.media.update()` - Update dimensions
- Transactions for batch updates

---

### 2. Generate Thumbnails from Pending (Prisma)

**File**: `scripts/generate-thumbnails-from-pending-prisma.mjs`

**Purpose**: Process pending thumbnail generation queue.

**Usage**:
```bash
node scripts/generate-thumbnails-from-pending-prisma.mjs
```

**What it does**:
1. Queries pending_thumbnails table using Prisma
2. For each pending item:
   - Downloads media from R2
   - Extracts EXIF metadata (images) or video metadata
   - Generates thumbnails (small, medium, large)
   - Uploads thumbnails to R2
   - Updates media table with metadata and dimensions
3. Removes processed items from pending_thumbnails

**Prisma Operations Used**:
- `prisma.pendingThumbnails.findMany()` - Query pending items
- `prisma.media.findUnique()` - Get media type
- `prisma.media.update()` - Update metadata and dimensions
- `prisma.pendingThumbnails.deleteMany()` - Clean up queue
- Transactions for batch operations

---

## Utility Library

### Prisma Client Factory

**File**: `scripts/lib/prisma-client.mjs`

**Exports**:

#### `createLocalPrismaClient()`
Creates Prisma Client for local SQLite database.

```javascript
import { createLocalPrismaClient } from './lib/prisma-client.mjs';

const prisma = createLocalPrismaClient();

// Use Prisma
const media = await prisma.media.findMany();

// Always disconnect when done
await prisma.$disconnect();
```

#### `PrismaBatchUpdater`
Helper class for batching Prisma operations.

```javascript
import { PrismaBatchUpdater } from './lib/prisma-client.mjs';

const batchUpdater = new PrismaBatchUpdater(prisma);

// Add operations
batchUpdater.add((tx) =>
  tx.media.update({
    where: { key: 'photo1.jpg' },
    data: { width: 1920, height: 1080 }
  })
);

// Execute all in transaction
await batchUpdater.execute();
```

#### `toISOString(date)`
Convert Date to ISO string format for database.

```javascript
import { toISOString } from './lib/prisma-client.mjs';

const now = toISOString(); // "2025-11-09T22:30:00.000Z"
```

#### `normalizeValue(val)`
Normalize metadata values for database storage.

```javascript
import { normalizeValue } from './lib/prisma-client.mjs';

normalizeValue(null);      // null
normalizeValue(undefined); // null
normalizeValue({});        // null (objects not supported)
normalizeValue("value");   // "value"
normalizeValue(123);       // 123
```

---

## Setup

### Prerequisites

1. **Local Database**:
   ```bash
   # Create/update local database
   npx prisma migrate dev

   # Generate Prisma Client
   npx prisma generate
   ```

2. **Environment Variables**:
   Ensure `.env` file exists:
   ```bash
   DATABASE_URL="file:./prisma/dev.db"
   ```

3. **Worker for R2 Access**:
   Scripts use `unstable_dev` to start a worker for accessing R2 files.
   Worker config: `scripts/wrangler-process-locally.toml`

---

## Migration from Legacy Scripts

### Before (Raw SQL with wrangler CLI)

```javascript
// OLD: scripts/extract-all-dimensions.mjs
const result = execSync('npx wrangler d1 execute wedding-photos-metadata --command "SELECT key, type FROM media" --json --remote');

const updateSql = `
  UPDATE media SET
    width = ${dimensions.width},
    height = ${dimensions.height}
  WHERE key = '${key}'`;

execSync('npx wrangler d1 execute wedding-photos-metadata --file=/tmp/update.sql --remote --yes');
```

**Issues**:
- ❌ No type safety
- ❌ SQL string manipulation prone to errors
- ❌ No compile-time checking
- ❌ Requires wrangler CLI for every operation
- ❌ Difficult to batch operations efficiently

### After (Prisma ORM)

```javascript
// NEW: scripts/extract-all-dimensions-prisma.mjs
const prisma = createLocalPrismaClient();

const allMedia = await prisma.media.findMany({
  select: { key: true, type: true },
  orderBy: { uploadedAt: 'asc' }
});

await prisma.media.update({
  where: { key },
  data: {
    width: dimensions.width,
    height: dimensions.height,
    updatedAt: toISOString()
  }
});
```

**Benefits**:
- ✅ Type-safe operations
- ✅ IDE autocomplete
- ✅ Compile-time checking
- ✅ Direct database access (no CLI calls)
- ✅ Easy to batch with transactions

---

## Local vs Remote Workflow

### Local Development (Recommended)

```bash
# 1. Run scripts against local database
node scripts/extract-all-dimensions-prisma.mjs

# 2. Database is automatically updated
# 3. View changes with Prisma Studio
npx prisma studio
```

**Advantages**:
- ✅ Fast development
- ✅ Easy to test
- ✅ No network latency
- ✅ Can rollback changes

### Syncing to Production D1

**Option 1: Schema Migrations** (Recommended for schema changes)
```bash
# Create migration
npx prisma migrate dev --name add_new_field

# Apply to remote D1
npx wrangler d1 execute wedding-photos-metadata --file=./prisma/migrations/MIGRATION_NAME/migration.sql --remote
```

**Option 2: Data Export/Import** (For bulk data changes)
```bash
# Export local database
sqlite3 prisma/dev.db .dump > data.sql

# Import to D1 (via wrangler)
npx wrangler d1 execute wedding-photos-metadata --file=data.sql --remote
```

**Option 3: Individual Updates** (For specific records)
```bash
# Use Prisma to generate SQL, then execute via wrangler
# This is useful for one-off updates
```

---

## Best Practices

### 1. Always Use Transactions for Batch Updates

```javascript
const batchUpdater = new PrismaBatchUpdater(prisma);

for (const item of items) {
  batchUpdater.add((tx) =>
    tx.media.update({ where: { key: item.key }, data: { ... } })
  );
}

await batchUpdater.execute(); // All or nothing
```

### 2. Disconnect Prisma Client When Done

```javascript
try {
  const prisma = createLocalPrismaClient();
  // ... do work
} finally {
  await prisma.$disconnect();
}
```

### 3. Use Selective Field Loading

```javascript
// ✅ Good - load only what you need
await prisma.media.findMany({
  select: { key: true, type: true, width: true, height: true }
});

// ❌ Bad - loads all 30+ fields
await prisma.media.findMany();
```

### 4. Batch Operations for Efficiency

```javascript
// Execute every N items to avoid memory issues
if (batchUpdater.count >= 50) {
  await batchUpdater.execute();
}
```

### 5. Handle Errors Gracefully

```javascript
for (const item of items) {
  try {
    // Process item
  } catch (error) {
    console.error(`Failed to process ${item.key}:`, error.message);
    // Continue with next item
  }
}
```

---

## Troubleshooting

### Issue: "PrismaClient is unable to run in the browser"

**Cause**: Trying to use Prisma Client in browser/worker context.

**Solution**: These scripts run in Node.js, not in Workers. Use `node` to execute them.

---

### Issue: "Environment variable not found: DATABASE_URL"

**Cause**: Missing `.env` file or incorrect `DATABASE_URL`.

**Solution**:
```bash
# Create .env file
echo 'DATABASE_URL="file:./prisma/dev.db"' > .env

# Run prisma migrate to create database
npx prisma migrate dev
```

---

### Issue: "Table 'media' does not exist"

**Cause**: Local database hasn't been initialized.

**Solution**:
```bash
# Run migrations to create tables
npx prisma migrate dev

# Or reset database
npx prisma migrate reset
```

---

### Issue: "Worker failed to start"

**Cause**: Wrangler worker in `scripts/process-locally.ts` failed to start.

**Solution**:
```bash
# Check worker config
cat scripts/wrangler-process-locally.toml

# Ensure worker file exists
ls scripts/process-locally.ts

# Check for port conflicts
lsof -i :8787
```

---

## Performance Considerations

### Batch Size

```javascript
// Good: Batch 50 items at a time
if (batchUpdater.count >= 50) {
  await batchUpdater.execute();
}
```

### Query Optimization

```javascript
// ✅ Good: Use select to load only needed fields
await prisma.media.findMany({
  select: { key: true, type: true }
});

// ✅ Good: Use pagination for large datasets
await prisma.media.findMany({
  take: 100,
  skip: offset
});

// ❌ Bad: Loading all fields for all records
await prisma.media.findMany();
```

### Transaction Size

- Keep transactions under 100 operations
- Large transactions can cause memory issues
- Use batching helper to manage transaction size automatically

---

## Example: Creating a New Prisma Script

```javascript
/**
 * Example: Update camera make for all Canon photos
 */

import { createLocalPrismaClient, toISOString } from './lib/prisma-client.mjs';

async function main() {
  const prisma = createLocalPrismaClient();

  try {
    // Find all Canon photos
    const canonPhotos = await prisma.media.findMany({
      where: {
        cameraMake: { contains: 'canon', mode: 'insensitive' }
      },
      select: { key: true, cameraMake: true }
    });

    console.log(`Found ${canonPhotos.length} Canon photos`);

    // Update them
    for (const photo of canonPhotos) {
      await prisma.media.update({
        where: { key: photo.key },
        data: {
          cameraMake: 'Canon', // Normalize
          updatedAt: toISOString()
        }
      });
    }

    console.log('✓ Done!');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(console.error);
```

---

## Migration Status

| Script | Status | Prisma Version | Notes |
|--------|--------|----------------|-------|
| `extract-all-dimensions.mjs` | ✅ Migrated | `extract-all-dimensions-prisma.mjs` | Type-safe dimension extraction |
| `generate-thumbnails-from-pending.mjs` | ✅ Migrated | `generate-thumbnails-from-pending-prisma.mjs` | Type-safe metadata updates |
| Other scripts | 📋 Legacy | N/A | Can be migrated as needed using same patterns |

---

## Next Steps

1. **Test Prisma Scripts**: Run against local database to verify functionality
2. **Create More Helpers**: Add common query patterns to `prisma-client.mjs`
3. **Migrate Remaining Scripts**: Apply same patterns to other maintenance scripts
4. **Production Sync Strategy**: Establish workflow for syncing local changes to D1
5. **Monitoring**: Add logging and error reporting to scripts

---

## Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Prisma Client API](https://www.prisma.io/docs/concepts/components/prisma-client)
- [Transactions](https://www.prisma.io/docs/concepts/components/prisma-client/transactions)
- [Query Optimization](https://www.prisma.io/docs/guides/performance-and-optimization)
