# Prisma ORM Integration Guide

## Overview

This project now uses Prisma ORM for type-safe database access across Cloudflare Workers. Prisma provides:

- **Type-safe queries**: Catch schema mismatches at compile time
- **Schema as code**: Single source of truth in `schema.prisma`
- **Migration management**: Versioned migrations instead of manual SQL scripts
- **Better testing**: Same Prisma client works for local SQLite and remote D1
- **Query builder**: Reduces SQL injection risks and improves query composability

## Project Structure

```
wedding-gallery/
├── prisma/
│   ├── schema.prisma              # Database schema definition
│   ├── migrations/                # Version-controlled migrations
│   │   └── 20251109221937_init/  # Initial migration from existing schema
│   │       └── migration.sql
│   └── dev.db                     # Local SQLite database for development (gitignored)
├── .env                           # Local environment variables (gitignored)
└── workers/
    ├── viewer/                    # ✅ Migrated to Prisma
    │   └── src/lib/prisma.ts     # Prisma helper for D1 adapter
    ├── album/                     # ✅ Migrated to Prisma
    │   └── src/lib/prisma.ts     # Prisma helper for D1 adapter
    └── video-streaming/           # ✅ Migrated to Prisma
        └── src/lib/prisma.ts     # Prisma helper for D1 adapter
```

## Schema Definition

The Prisma schema (`prisma/schema.prisma`) defines two main models:

### Media Model
Stores all uploaded media (images and videos) with comprehensive metadata:
- File information (key, filename, type, size)
- EXIF metadata (camera, lens, settings)
- GPS coordinates
- Video metadata (duration, codec, HLS qualities)
- Thumbnails
- Dimensions (width, height)

### PendingThumbnails Model
Queue for images awaiting thumbnail generation.

## Local Development Setup

### Prerequisites
- Node.js and npm installed
- Prisma CLI (installed via `npm install`)

### Initialize Local Database

```bash
# 1. Create local database and run migrations
npx prisma migrate dev

# 2. Generate Prisma Client
npx prisma generate
```

This creates:
- `prisma/dev.db` - Local SQLite database
- `node_modules/@prisma/client` - Generated Prisma Client

### Environment Variables

Create `.env` in the project root:

```bash
# Local development database
DATABASE_URL="file:./prisma/dev.db"
```

## Using Prisma in Workers

### 1. Import Dependencies

```typescript
import { PrismaClient } from "@prisma/client";
import { PrismaD1 } from "@prisma/adapter-d1";
```

### 2. Create Prisma Client with D1 Adapter

```typescript
// Helper function (see workers/viewer/src/lib/prisma.ts)
export function createPrismaClient(d1Database: D1Database): PrismaClient {
  const adapter = new PrismaD1(d1Database);
  return new PrismaClient({ adapter });
}
```

### 3. Query Database

**Before (Raw SQL)**:
```typescript
const result = await env.DB.prepare(`
  SELECT key, filename, type, width, height
  FROM media
  WHERE type = ?
  ORDER BY date_taken
`).bind('image').all();
```

**After (Prisma - Type-Safe)**:
```typescript
const prisma = createPrismaClient(env.DB);

const media = await prisma.media.findMany({
  where: { type: 'image' },
  select: {
    key: true,
    filename: true,
    type: true,
    width: true,
    height: true
  },
  orderBy: { dateTaken: 'asc' }
});
```

### Benefits of Prisma Queries

✅ **TypeScript autocomplete** - IDE suggests available fields
✅ **Type checking** - Catches typos and wrong field types
✅ **Null safety** - TypeScript knows which fields can be null
✅ **Composable** - Easily add filters, sorting, pagination
✅ **Secure** - No SQL injection vulnerabilities

## Worker Migration Examples

All production workers have been migrated to Prisma. Here are the key patterns used:

### Viewer Worker (`workers/viewer/src/index.ts`)

**Migration**: List all media with filtering and sorting

**Before**:
```typescript
const result = await env.DB.prepare(`
  SELECT key, filename, type, size, uploaded_at, date_taken, camera_make, camera_model, width, height
  FROM media
  ORDER BY COALESCE(date_taken, uploaded_at) ASC
`).all();
```

**After**:
```typescript
const prisma = createPrismaClient(env.DB);
const mediaResults = await prisma.media.findMany({
  select: {
    key: true, filename: true, type: true, size: true,
    uploadedAt: true, dateTaken: true, cameraMake: true,
    cameraModel: true, width: true, height: true,
  },
  orderBy: [{ dateTaken: 'asc' }, { uploadedAt: 'asc' }],
});
```

### Album Worker (`workers/album/src/index.ts`)

**Migration**: Upload file and create database records

**Before**:
```typescript
await env.DB.prepare(`
  INSERT OR REPLACE INTO media (key, filename, type, size, uploaded_at, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).bind(fileName, file.name, fileType, file.size, uploadedAt, uploadedAt, uploadedAt).run();

await env.DB.prepare(`
  INSERT OR IGNORE INTO pending_thumbnails (key, created_at)
  VALUES (?, ?)
`).bind(fileName, uploadedAt).run();
```

**After**:
```typescript
const prisma = createPrismaClient(env.DB);

await prisma.media.upsert({
  where: { key: fileName },
  create: {
    key: fileName, filename: file.name, type: fileType, size: file.size,
    uploadedAt: uploadedAt, createdAt: uploadedAt, updatedAt: uploadedAt
  },
  update: {
    filename: file.name, type: fileType, size: file.size,
    uploadedAt: uploadedAt, updatedAt: uploadedAt
  }
});

await prisma.pendingThumbnails.createMany({
  data: [{ key: fileName, createdAt: uploadedAt }],
  skipDuplicates: true
});
```

### Video Streaming Worker (`workers/video-streaming/src/handlers/hls.ts`)

**Migration**: Query HLS qualities for video

**Before**:
```typescript
const result = await env.DB.prepare(
  "SELECT hls_qualities FROM media WHERE key = ?"
).bind(videoKey).first();
```

**After**:
```typescript
const prisma = createPrismaClient(env.DB);
const mediaEntry = await prisma.media.findUnique({
  where: { key: videoKey },
  select: { hlsQualities: true }
});
```

### Key Migration Patterns

1. **Import Prisma helper** at the top of the file
2. **Create client** with `createPrismaClient(env.DB)`
3. **Use camelCase** for field names (Prisma convention vs snake_case in DB)
4. **Type safety** - TypeScript catches errors at compile time
5. **Null handling** - Prisma knows which fields are nullable

## Testing with Prisma

### E2E Upload Test

The E2E test (`workers/album/test/e2e-upload.spec.ts`) demonstrates:

1. **Upload workflow testing**
   - Upload image via worker
   - Verify R2 storage
   - Verify database entries via Prisma

2. **Type-safe queries in tests**
   ```typescript
   const mediaEntry = await prisma.media.findUnique({
     where: { key: uploadedKey }
   });

   expect(mediaEntry?.filename).toBe(testFileName);
   expect(mediaEntry?.type).toBe('image');
   ```

3. **Advanced Prisma operations**
   - `findMany` with filters
   - `upsert` for create-or-update
   - `select` for specific fields
   - `orderBy` for sorting

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test workers/album/test/e2e-upload.spec.ts

# Run viewer worker tests
npm test workers/viewer/test
```

## Migration Strategy

### Phase 1: ✅ Foundation (Completed)
- [x] Install Prisma dependencies
- [x] Create schema matching existing D1 structure
- [x] Generate initial migration
- [x] Set up local development database
- [x] Create Prisma helper utilities

### Phase 2: ✅ Proof of Concept (Completed)
- [x] Migrate viewer worker to Prisma
- [x] Create E2E tests with Prisma
- [x] Verify bundle size (2.4MB total / 900KB gzipped - well within limits)
- [x] Validate type safety and developer experience

### Phase 3: ✅ Production Workers Migration (Completed)
- [x] Migrate album worker to Prisma (2424.42 KiB / 895.59 KiB gzipped)
- [x] Migrate video-streaming worker to Prisma (2482.96 KiB / 907.06 KiB gzipped)
- [x] All production workers now using type-safe Prisma queries
- [x] Bundle sizes verified and within limits

### Phase 4: ✅ Script Migration (Completed)
Maintenance scripts migrated to use Prisma for type-safe database operations:
- [x] Create Prisma client helper for Node.js scripts (`scripts/lib/prisma-client.mjs`)
- [x] Migrate `generate-thumbnails-from-pending.mjs` to Prisma
- [x] Migrate `extract-all-dimensions.mjs` to Prisma
- [x] Create comprehensive scripts guide (`PRISMA_SCRIPTS_GUIDE.md`)
- [x] Add npm scripts for common maintenance tasks

**See [PRISMA_SCRIPTS_GUIDE.md](./PRISMA_SCRIPTS_GUIDE.md) for detailed documentation.**

### Phase 5: 📋 Cleanup (Future)
- [ ] Remove legacy better-sqlite3 scripts (once fully migrated)
- [ ] Consolidate database utilities
- [ ] Create script migration guide

## Database Operations

### Creating Migrations

When you modify the schema:

```bash
# 1. Update prisma/schema.prisma with your changes

# 2. Create migration
npx prisma migrate dev --name descriptive_migration_name

# 3. Prisma will:
#    - Generate migration SQL
#    - Apply to local database
#    - Regenerate Prisma Client
```

### Applying Migrations to Production D1

For production, you'll need to manually apply migrations to D1:

```bash
# Option 1: Via wrangler CLI
wrangler d1 execute wedding-photos-metadata --file=./prisma/migrations/MIGRATION_NAME/migration.sql

# Option 2: Via Cloudflare dashboard
# Copy migration.sql content and run in D1 console
```

**Note**: D1 doesn't support Prisma's automatic migration deployment yet. Manual application required.

### Viewing Database

```bash
# Open Prisma Studio (GUI for browsing database)
npx prisma studio
```

## Common Prisma Patterns

### Find One
```typescript
const media = await prisma.media.findUnique({
  where: { key: 'photo-123.jpg' }
});
```

### Find Many with Filters
```typescript
const images = await prisma.media.findMany({
  where: {
    type: 'image',
    width: { gte: 1920 },
    cameraMake: { not: null }
  },
  orderBy: { dateTaken: 'desc' },
  take: 20
});
```

### Create
```typescript
await prisma.media.create({
  data: {
    key: 'new-photo.jpg',
    filename: 'vacation.jpg',
    type: 'image',
    size: 2048000,
    uploadedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
});
```

### Update
```typescript
await prisma.media.update({
  where: { key: 'photo-123.jpg' },
  data: {
    width: 1920,
    height: 1080,
    updatedAt: new Date().toISOString()
  }
});
```

### Upsert (Create or Update)
```typescript
await prisma.media.upsert({
  where: { key: 'photo-123.jpg' },
  create: {
    key: 'photo-123.jpg',
    filename: 'photo.jpg',
    type: 'image',
    // ... other required fields
  },
  update: {
    width: 1920,
    height: 1080
  }
});
```

### Delete
```typescript
await prisma.media.delete({
  where: { key: 'photo-123.jpg' }
});
```

### Count
```typescript
const imageCount = await prisma.media.count({
  where: { type: 'image' }
});
```

## Performance Considerations

### Bundle Size
- Prisma Client adds ~500KB-1MB to worker bundle (gzipped)
- Viewer worker: 2.4MB total / 900KB gzipped (well within 10MB limit)
- Monitor bundle size when adding more features

### Cold Start
- Slight increase in cold start time due to Prisma initialization
- Impact is minimal (<50ms typically)
- Trade-off is worth it for type safety and developer experience

### Query Performance
- Prisma queries compile to efficient SQL
- Performance similar to raw SQL
- Use `select` to limit returned fields
- Add indexes in schema if needed (rare for SQLite/D1)

## Troubleshooting

### Issue: "Cannot find module '@prisma/client'"

**Solution**: Run `npx prisma generate` to generate the client.

### Issue: Changes to schema not reflected

**Solution**:
1. Run `npx prisma generate` to regenerate client
2. Restart worker development server

### Issue: Local database out of sync

**Solution**:
```bash
# Reset local database
npx prisma migrate reset

# Reapply all migrations
npx prisma migrate dev
```

### Issue: Type errors after schema changes

**Solution**:
1. Update `prisma/schema.prisma`
2. Run `npx prisma generate`
3. Restart TypeScript language server in IDE

## Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [Prisma D1 Adapter](https://www.prisma.io/docs/orm/overview/databases/cloudflare-d1)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Prisma with Cloudflare Workers](https://www.prisma.io/docs/orm/overview/databases/cloudflare-d1#example)

## Migration Checklist

When migrating a worker to Prisma:

- [ ] Add `@prisma/client` and `@prisma/adapter-d1` to package.json
- [ ] Create Prisma helper function (see `workers/viewer/src/lib/prisma.ts`)
- [ ] Import Prisma Client in worker code
- [ ] Replace raw SQL queries with Prisma queries
- [ ] Update field names from snake_case to camelCase
- [ ] Add null checks where appropriate
- [ ] Test locally with `wrangler dev`
- [ ] Test with unit/integration tests
- [ ] Verify bundle size with `wrangler deploy --dry-run`
- [ ] Deploy and monitor for errors

## Next Steps

1. **Complete Migration**: Migrate remaining workers (album, video-streaming) to Prisma
2. **Script Migration**: Update thumbnail generation and dimension extraction scripts
3. **Enhanced Testing**: Add more E2E tests covering edge cases
4. **Documentation**: Update worker-specific READMEs with Prisma examples
5. **Performance Monitoring**: Track cold start times and bundle sizes
