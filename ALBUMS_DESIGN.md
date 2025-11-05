# Albums & Multi-Tenancy Design Proposal

## Executive Summary

This document proposes a phased approach to add **albums** to the wedding-gallery application while designing for future **multi-tenancy**. The design maintains backward compatibility with the current single-gallery setup and leverages Cloudflare's serverless architecture.

---

## Current Architecture Analysis

### Existing Structure
- **Single tenant, single gallery**: All media in one flat namespace
- **Database**: D1 SQLite with `media` table (no grouping concept)
- **Storage**: R2 bucket with flat key structure: `{timestamp}-{filename}`
- **Authentication**: Single password for entire gallery
- **Workers**: Separate album (upload) and viewer workers

### Limitations
1. No way to organize media into collections/events
2. All users see all media (no access control granularity)
3. Cannot support multiple galleries/users without complete rewrite

---

## Design Goals

1. **Add Albums**: Group media into logical collections (e.g., "Ceremony", "Reception", "Candid Shots")
2. **Extensible for Multi-Tenancy**: Design schema and architecture to easily add tenant isolation later
3. **Backward Compatible**: Existing media should work without migration (optional migration path)
4. **Minimal Complexity**: Leverage existing Cloudflare infrastructure (D1, R2, Workers)
5. **Performance**: Maintain edge performance, no new external dependencies
6. **Phased Rollout**: Implement in stages (albums first, tenants later)

---

## Proposed Database Schema

### Phase 1: Albums (Immediate)

```sql
-- New table: Albums
CREATE TABLE albums (
  id TEXT PRIMARY KEY,                      -- UUID v4 (e.g., "a1b2c3d4-...")
  slug TEXT UNIQUE NOT NULL,                -- URL-friendly name (e.g., "ceremony")
  name TEXT NOT NULL,                       -- Display name (e.g., "Wedding Ceremony")
  description TEXT,                         -- Optional description
  cover_media_key TEXT,                     -- Key of media to use as cover image
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  -- Future multi-tenancy fields (unused in Phase 1)
  tenant_id TEXT DEFAULT 'default',         -- Reserved for Phase 2

  FOREIGN KEY (cover_media_key) REFERENCES media(key) ON DELETE SET NULL
);

CREATE INDEX idx_albums_slug ON albums(slug);
CREATE INDEX idx_albums_tenant ON albums(tenant_id);  -- For future use

-- Modified table: Media (add album relationship)
ALTER TABLE media ADD COLUMN album_id TEXT REFERENCES albums(id) ON DELETE SET NULL;
ALTER TABLE media ADD COLUMN tenant_id TEXT DEFAULT 'default';  -- Future use

CREATE INDEX idx_media_album ON media(album_id);
CREATE INDEX idx_media_tenant ON media(tenant_id);

-- Migration helper: Default album for existing media
INSERT INTO albums (id, slug, name, description, tenant_id)
VALUES (
  'default-album',
  'all',
  'All Photos',
  'Wedding photo gallery',
  'default'
);

-- Assign all existing media to default album (optional, can be NULL)
UPDATE media SET album_id = 'default-album' WHERE album_id IS NULL;
```

### Phase 2: Multi-Tenancy (Future)

```sql
-- New table: Tenants (Phase 2)
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,                      -- UUID v4
  slug TEXT UNIQUE NOT NULL,                -- URL subdomain/path (e.g., "smith-wedding")
  name TEXT NOT NULL,                       -- Display name (e.g., "Smith Wedding 2025")
  email TEXT NOT NULL,                      -- Contact email
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,

  -- Settings
  settings TEXT,                            -- JSON blob for tenant-specific config
  subscription_tier TEXT DEFAULT 'free',    -- For future pricing tiers
  is_active INTEGER DEFAULT 1               -- Soft delete flag
);

CREATE INDEX idx_tenants_slug ON tenants(slug);

-- New table: Album access control (Phase 2)
CREATE TABLE album_access (
  album_id TEXT NOT NULL,
  access_type TEXT NOT NULL,                -- "public", "password", "private"
  password_hash TEXT,                       -- Bcrypt/Argon2 hash if password-protected
  expires_at TEXT,                          -- Optional expiration
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (album_id),
  FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
);

-- New table: User sessions (Phase 2, if needed)
CREATE TABLE user_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  album_id TEXT,                            -- NULL = tenant-wide access
  ip_address TEXT,
  user_agent TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_tenant ON user_sessions(tenant_id);
CREATE INDEX idx_sessions_expires ON user_sessions(expires_at);
```

---

## Storage Architecture (R2)

### Phase 1: Backward-Compatible Album Organization

**Option A: Keep Flat Structure** (Recommended for Phase 1)
- Continue using `{timestamp}-{filename}` keys
- Rely on database `album_id` for organization
- **Pros**: No migration, existing URLs work, simpler
- **Cons**: Less intuitive when browsing R2 directly

```
wedding-photos/
├── 1699123456-photo1.jpg         # Existing files unchanged
├── 1699123457-photo2.jpg
├── thumbnails/
│   ├── small/1699123456-photo1.jpg
│   └── ...
└── hls/
    └── ...
```

**Option B: Album Prefixes** (Alternative)
- New uploads: `albums/{album_id}/{timestamp}-{filename}`
- Existing files: Stay at root or move to `albums/default-album/`
- **Pros**: Clearer organization, easier R2 bucket browsing
- **Cons**: Requires migration script, URL changes

```
wedding-photos/
├── albums/
│   ├── ceremony/
│   │   ├── 1699123456-photo1.jpg
│   │   └── 1699123457-photo2.jpg
│   └── reception/
│       └── 1699123458-photo3.jpg
├── thumbnails/
│   ├── small/albums/ceremony/1699123456-photo1.jpg
│   └── ...
└── hls/
    └── albums/ceremony/1699123456-video1.mp4/
        └── master.m3u8
```

**Recommendation**: Start with **Option A** for Phase 1, migrate to **Option B** if needed in Phase 2.

### Phase 2: Tenant Isolation

```
wedding-photos/
├── tenants/
│   ├── {tenant_id}/
│   │   ├── albums/
│   │   │   ├── {album_id}/
│   │   │   │   └── {timestamp}-{filename}
│   │   ├── thumbnails/
│   │   │   └── ...
│   │   └── hls/
│   │       └── ...
```

**Alternative**: Use separate R2 buckets per tenant for better isolation and billing.

---

## API Endpoints

### Phase 1: Album-Aware Endpoints

#### Viewer Worker Updates

```typescript
// Existing endpoints - modified to support album filtering
GET  /                              // Gallery home - shows album list
GET  /albums/:slug                  // View specific album
GET  /api/albums                    // List all albums (metadata)
GET  /api/albums/:id/media          // Get media for specific album
GET  /api/media?album=:slug         // Backward-compatible: filter by album

// New album management endpoints (for upload worker or admin)
POST   /api/albums                  // Create new album
PUT    /api/albums/:id              // Update album metadata
DELETE /api/albums/:id              // Delete album (not media)
PATCH  /api/albums/:id/cover        // Set cover image

// Existing endpoints - unchanged
GET  /api/file/:key
GET  /api/thumbnail/:key
GET  /api/hls/:videoKey/:filename
POST /login
GET  /api/cache-version
```

#### Album Worker Updates

```typescript
// Modified upload endpoint
POST /upload?album=:slug            // Upload to specific album
                                    // Falls back to default album if not specified
```

### Phase 2: Multi-Tenant Endpoints

```typescript
// Tenant routing - option A: Subdomain-based
GET  https://{tenant-slug}.wedding-photos.app/
GET  https://{tenant-slug}.wedding-photos.app/albums/:slug

// Tenant routing - option B: Path-based (easier with Workers)
GET  /{tenant-slug}/
GET  /{tenant-slug}/albums/:slug

// Admin API
POST   /api/tenants                 // Create new tenant
GET    /api/tenants/:id/albums      // List tenant's albums
PUT    /api/tenants/:id/settings    // Update tenant settings
```

---

## Authentication & Authorization

### Phase 1: Simple Album Passwords

```typescript
interface AlbumAuth {
  albumId: string;
  accessType: 'public' | 'password' | 'inherited';  // inherited = use gallery password
  passwordHash?: string;  // Only if accessType = 'password'
}
```

**Flow**:
1. User visits `/albums/ceremony`
2. If album is password-protected, redirect to `/albums/ceremony/login`
3. Set cookie: `album_auth_{album_id}` with HMAC signature
4. Gallery-wide password still works for all albums (backward compatible)

**Cookie Structure**:
```typescript
// Existing: gallery_auth (global access)
// New: album_auth_{album_id} (per-album access)
{
  albumId: string;
  expiresAt: number;
  signature: string;  // HMAC-SHA256 of albumId + expiresAt
}
```

### Phase 2: Tenant-Scoped Auth

```typescript
interface TenantAuth {
  tenantId: string;
  albumIds: string[];  // Albums user can access
  role: 'owner' | 'guest';  // Owner = full access, Guest = view only
}
```

**Cookie**: `tenant_auth_{tenant_id}` with JWT or similar.

**Integration Options**:
- Cloudflare Access (zero-trust, email auth)
- Custom JWT with Cloudflare Workers
- Third-party: Auth0, Clerk, Supabase Auth

---

## Migration Strategy

### Step 1: Database Schema Migration

```sql
-- Run in Wrangler CLI or GitHub Action
npx wrangler d1 execute wedding-photos-metadata --file=migrations/001_add_albums.sql

-- migrations/001_add_albums.sql
BEGIN TRANSACTION;

-- Add albums table
CREATE TABLE albums (...);

-- Add album_id to media
ALTER TABLE media ADD COLUMN album_id TEXT;
ALTER TABLE media ADD COLUMN tenant_id TEXT DEFAULT 'default';

-- Create default album
INSERT INTO albums (id, slug, name, tenant_id) VALUES (...);

-- Optionally assign existing media to default album
-- UPDATE media SET album_id = 'default-album' WHERE album_id IS NULL;

COMMIT;
```

### Step 2: Code Deployment

1. **Deploy database migration**: Run SQL via Wrangler
2. **Deploy viewer worker**: Updated with album endpoints
3. **Deploy album worker**: Updated to accept `album` query param
4. **Update frontend**: Add album selector UI

### Step 3: Data Migration (Optional)

If choosing **Option B** (album prefixes in R2):

```typescript
// Script: scripts/migrate-to-album-structure.mjs
import { S3Client, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

async function migrateMedia() {
  const media = await db.query('SELECT key, album_id FROM media');

  for (const item of media) {
    const newKey = `albums/${item.album_id}/${item.key}`;

    // Copy to new location
    await s3.send(new CopyObjectCommand({
      Bucket: 'wedding-photos',
      CopySource: `wedding-photos/${item.key}`,
      Key: newKey
    }));

    // Update database
    await db.query('UPDATE media SET key = ? WHERE key = ?', [newKey, item.key]);

    // Delete old location (after verification)
    await s3.send(new DeleteObjectCommand({
      Bucket: 'wedding-photos',
      Key: item.key
    }));
  }
}
```

**Run via**:
```bash
node scripts/migrate-to-album-structure.mjs --dry-run
node scripts/migrate-to-album-structure.mjs --execute
```

---

## Implementation Phases

### Phase 1: Albums (Weeks 1-3)

**Week 1: Database & Backend**
- [ ] Create database migration script (`001_add_albums.sql`)
- [ ] Update `Env` interface to include album context
- [ ] Add album CRUD handlers in viewer worker
- [ ] Modify `/api/media` to support album filtering
- [ ] Update upload handler to accept `album` parameter

**Week 2: Frontend**
- [ ] Add album list view to gallery home page
- [ ] Add album selector dropdown in upload UI
- [ ] Update gallery grid to show album context
- [ ] Add album management UI (create/edit albums)

**Week 3: Authentication & Polish**
- [ ] Implement per-album password protection
- [ ] Add album cover image selection
- [ ] Update thumbnail/video processing scripts to handle album structure
- [ ] Testing and bug fixes

### Phase 2: Multi-Tenancy (Future - Weeks 4-8)

**Week 4-5: Tenant Infrastructure**
- [ ] Create tenant registration flow
- [ ] Implement tenant routing (subdomain or path-based)
- [ ] Migrate to per-tenant R2 prefixes or buckets
- [ ] Add tenant admin dashboard

**Week 6-7: Advanced Features**
- [ ] Implement per-tenant authentication (Cloudflare Access or JWT)
- [ ] Add usage tracking per tenant (storage, bandwidth)
- [ ] Create tenant billing integration (Stripe)
- [ ] Add tenant settings (branding, custom domain)

**Week 8: Migration & Testing**
- [ ] Migrate existing gallery to first tenant
- [ ] Test tenant isolation (data leakage prevention)
- [ ] Performance testing at scale
- [ ] Documentation for self-service tenant creation

---

## Example Code Changes

### Database Query Updates (Viewer Worker)

**Before**:
```typescript
async function getMedia(env: Env) {
  const { results } = await env.DB.prepare(
    'SELECT * FROM media ORDER BY uploaded_at DESC'
  ).all();
  return results;
}
```

**After (Phase 1)**:
```typescript
async function getMedia(env: Env, albumId?: string) {
  let query = 'SELECT * FROM media WHERE 1=1';
  const params: any[] = [];

  if (albumId) {
    query += ' AND album_id = ?';
    params.push(albumId);
  }

  query += ' ORDER BY uploaded_at DESC';

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return results;
}
```

**After (Phase 2)**:
```typescript
async function getMedia(env: Env, tenantId: string, albumId?: string) {
  let query = 'SELECT * FROM media WHERE tenant_id = ?';
  const params: any[] = [tenantId];

  if (albumId) {
    query += ' AND album_id = ?';
    params.push(albumId);
  }

  query += ' ORDER BY uploaded_at DESC';

  const { results } = await env.DB.prepare(query).bind(...params).all();
  return results;
}
```

### Upload Handler Updates (Album Worker)

**Before**:
```typescript
async function handleUpload(request: Request, env: Env) {
  const formData = await request.formData();
  const file = formData.get('file') as File;

  const key = `${Date.now()}-${file.name}`;
  await env.PHOTOS_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type }
  });

  await env.DB.prepare(
    'INSERT INTO media (key, filename, type) VALUES (?, ?, ?)'
  ).bind(key, file.name, file.type.startsWith('image') ? 'image' : 'video').run();
}
```

**After (Phase 1)**:
```typescript
async function handleUpload(request: Request, env: Env) {
  const url = new URL(request.url);
  const albumSlug = url.searchParams.get('album') || 'all';

  // Get album ID from slug
  const album = await env.DB.prepare(
    'SELECT id FROM albums WHERE slug = ?'
  ).bind(albumSlug).first();

  if (!album) {
    return new Response('Album not found', { status: 404 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File;

  const key = `${Date.now()}-${file.name}`;
  await env.PHOTOS_BUCKET.put(key, file.stream(), {
    httpMetadata: { contentType: file.type },
    customMetadata: {
      albumId: album.id
    }
  });

  await env.DB.prepare(
    'INSERT INTO media (key, filename, type, album_id) VALUES (?, ?, ?, ?)'
  ).bind(
    key,
    file.name,
    file.type.startsWith('image') ? 'image' : 'video',
    album.id
  ).run();
}
```

### Gallery Template Updates

**New Album List View** (`/workers/viewer/src/templates/album-list.ts`):
```typescript
export function renderAlbumList(albums: Album[]) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Photo Albums</title>
      <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    </head>
    <body>
      <div class="container mt-5">
        <h1>Photo Albums</h1>
        <div class="row row-cols-1 row-cols-md-3 g-4 mt-3">
          ${albums.map(album => `
            <div class="col">
              <div class="card h-100">
                ${album.cover_media_key ? `
                  <img src="/api/thumbnail/${album.cover_media_key}?size=medium"
                       class="card-img-top" alt="${album.name}">
                ` : `
                  <div class="bg-secondary" style="height: 200px;"></div>
                `}
                <div class="card-body">
                  <h5 class="card-title">${album.name}</h5>
                  <p class="card-text">${album.description || ''}</p>
                  <a href="/albums/${album.slug}" class="btn btn-primary">View Album</a>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </body>
    </html>
  `;
}
```

---

## Routing Architecture

### Phase 1: Album Routes

```typescript
// workers/viewer/src/index.ts
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Authentication check
    if (!isAuthenticated(request, env) && !path.startsWith('/login')) {
      return Response.redirect('/login', 302);
    }

    // Route handling
    if (path === '/') {
      return handleAlbumList(env);  // Show all albums
    }

    if (path.startsWith('/albums/')) {
      const slug = path.split('/')[2];
      return handleAlbumView(slug, env);
    }

    if (path === '/api/albums') {
      return handleAlbumsAPI(env);
    }

    if (path.startsWith('/api/albums/') && path.includes('/media')) {
      const albumId = path.split('/')[3];
      return handleAlbumMedia(albumId, env);
    }

    // Existing routes
    if (path.startsWith('/api/file/')) { ... }
    if (path.startsWith('/api/thumbnail/')) { ... }

    return new Response('Not Found', { status: 404 });
  }
};
```

### Phase 2: Tenant Routes (Option A: Path-based)

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // Extract tenant from path: /{tenant-slug}/...
    const tenantSlug = pathParts[0] || 'default';
    const tenant = await getTenant(tenantSlug, env);

    if (!tenant) {
      return new Response('Tenant not found', { status: 404 });
    }

    // Check tenant-scoped authentication
    if (!isAuthenticatedForTenant(request, tenant.id, env)) {
      return Response.redirect(`/${tenantSlug}/login`, 302);
    }

    // Route within tenant context
    const subPath = '/' + pathParts.slice(1).join('/');

    if (subPath === '/' || subPath === '') {
      return handleAlbumList(tenant.id, env);
    }

    if (subPath.startsWith('/albums/')) {
      const slug = pathParts[2];
      return handleAlbumView(tenant.id, slug, env);
    }

    // ... rest of routing
  }
};
```

---

## Performance Considerations

### Database Indexing

Ensure indexes are created for common queries:
```sql
-- Album lookups
CREATE INDEX idx_albums_slug ON albums(slug);
CREATE INDEX idx_albums_tenant ON albums(tenant_id);

-- Media queries
CREATE INDEX idx_media_album ON media(album_id);
CREATE INDEX idx_media_tenant ON media(tenant_id);
CREATE INDEX idx_media_uploaded_at ON media(uploaded_at);

-- Composite index for tenant + album queries (Phase 2)
CREATE INDEX idx_media_tenant_album ON media(tenant_id, album_id, uploaded_at);
```

### Caching Strategy

**Phase 1**:
- Cache album list in KV: `albums_list` (TTL: 5 minutes)
- Cache album metadata: `album_{album_id}` (TTL: 10 minutes)
- Bust cache on album create/update/delete

**Phase 2**:
- Per-tenant cache keys: `tenant_{tenant_id}_albums_list`
- Consider Cloudflare Cache API for edge caching

### R2 Performance

- Use `list()` with prefix filters: `albums/{album_id}/`
- Enable R2 custom domains for faster access
- Consider CDN caching for thumbnails (Cache-Control headers)

---

## Testing Strategy

### Phase 1 Tests

**Database**:
```bash
# Test album creation
npx wrangler d1 execute wedding-photos-metadata --command \
  "INSERT INTO albums (id, slug, name) VALUES ('test-1', 'test', 'Test Album')"

# Test media assignment
npx wrangler d1 execute wedding-photos-metadata --command \
  "UPDATE media SET album_id = 'test-1' WHERE key = '1699123456-photo.jpg'"

# Query album media
npx wrangler d1 execute wedding-photos-metadata --command \
  "SELECT * FROM media WHERE album_id = 'test-1'"
```

**API**:
```bash
# Test album list
curl https://wedding-photos.example.com/api/albums

# Test album media
curl https://wedding-photos.example.com/api/albums/ceremony/media

# Test upload with album
curl -F "file=@test.jpg" https://upload.example.com/upload?album=ceremony
```

### Phase 2 Tests

**Tenant Isolation**:
```typescript
// Verify tenant A cannot access tenant B's data
test('Tenant isolation', async () => {
  const tenantA = 'smith-wedding';
  const tenantB = 'jones-wedding';

  // Try to access tenant B's album from tenant A session
  const response = await fetch(`/${tenantA}/albums/ceremony`, {
    headers: { Cookie: `tenant_auth_${tenantB}=...` }
  });

  expect(response.status).toBe(403);
});
```

---

## Backward Compatibility

### Ensuring Existing Deployments Work

1. **Default Album**: All existing media gets assigned to `default-album` (optional)
2. **Null Album ID**: If `album_id` is NULL, media appears in "All Photos" view
3. **Existing URLs**: `/` still shows gallery (either default album or album list)
4. **Single Password**: Gallery-wide password still grants access to all albums

### Migration Path for Users

**Option 1: Automatic**
```sql
-- On first deployment, create default album and assign all media
INSERT INTO albums (id, slug, name) VALUES ('default-album', 'all', 'All Photos');
UPDATE media SET album_id = 'default-album' WHERE album_id IS NULL;
```

**Option 2: Manual** (Recommended)
- Deploy with albums table empty
- Admin manually creates albums via UI
- Admin bulk-assigns media to albums via admin panel
- Unassigned media shows in "Uncategorized" view

---

## Security Considerations

### Phase 1: Album Security

1. **SQL Injection**: Use parameterized queries (already done)
2. **Album Slug Validation**: Regex `^[a-z0-9-]+$` (alphanumeric + hyphens)
3. **Password Storage**: Use `crypto.subtle.digest()` with salt for album passwords
4. **Cookie Security**:
   - HttpOnly, Secure, SameSite=Lax
   - HMAC signature with `AUTH_SECRET`
   - Short TTL (24 hours for album auth)

### Phase 2: Multi-Tenant Security

1. **Tenant Isolation**:
   - Always filter by `tenant_id` in SQL queries
   - Use prepared statements with tenant ID binding
   - Implement row-level security if using Postgres (future)

2. **R2 Access Control**:
   - Option A: Shared bucket with prefix filtering
   - Option B: Separate buckets per tenant (better isolation)

3. **Rate Limiting**:
   - Cloudflare Workers rate limiting
   - Per-tenant quotas (storage, bandwidth, API calls)

4. **CORS**:
   - Restrict to tenant's custom domain only
   - No wildcard CORS in multi-tenant mode

---

## Cost Implications

### Cloudflare Pricing (Approximate)

**Current (Single Tenant)**:
- Workers: Free tier (100k req/day) or $5/month
- D1: Free tier (5M reads, 100k writes/day)
- R2: $0.015/GB storage, $0.36/million reads (free egress)
- KV: Free tier (100k reads/day)

**With Albums (Phase 1)**:
- Same as current (minimal additional DB operations)

**With Multi-Tenancy (Phase 2)**:
- Potentially 10-100x more requests/storage
- Recommendation: Workers Paid ($5/month) + R2 scaling
- Estimated cost per tenant (low usage): $1-5/month

**Optimization Tips**:
- Use KV caching aggressively
- Enable Cloudflare Cache API for static assets
- Implement lazy loading for album lists
- Consider tiered pricing (free tier = 1 album, paid = unlimited)

---

## Alternative Approaches

### Alternative 1: Use R2 Prefixes Only (No Albums Table)

**Pros**:
- Simpler schema
- No additional database reads
- R2 `list()` can filter by prefix

**Cons**:
- No album metadata (description, cover image)
- Harder to rename albums
- No album-level settings (passwords, expiration)

**Verdict**: Not recommended - too limited for future extensibility.

---

### Alternative 2: Separate R2 Buckets per Tenant

**Pros**:
- True isolation (better security)
- Independent billing per tenant
- Easier to delete tenant data (compliance)

**Cons**:
- Cloudflare limits: 1000 buckets per account
- More complex bucket management
- Cannot use shared CDN cache

**Verdict**: Consider for Phase 2 if tenant count < 1000.

---

### Alternative 3: Use Cloudflare Durable Objects

**Pros**:
- Built-in coordination for multi-tenant state
- Persistent storage per object

**Cons**:
- More expensive ($0.15/million requests)
- Overkill for mostly read-heavy workload
- Additional complexity

**Verdict**: Not needed for this use case.

---

## Recommended Implementation Order

### Phase 1A: Basic Albums (Highest Priority)

1. **Database migration**: Add `albums` table and `album_id` column
2. **Default album**: Create "All Photos" album
3. **API endpoint**: `GET /api/albums/:slug/media`
4. **Gallery UI**: Add album filter dropdown
5. **Upload UI**: Add album selector

**Goal**: Users can manually organize photos into albums.

---

### Phase 1B: Album Management (Medium Priority)

1. **Admin UI**: Create/edit/delete albums
2. **Bulk operations**: Assign multiple media to album
3. **Cover images**: Set album cover
4. **Album passwords**: Per-album access control

**Goal**: Self-service album management without code changes.

---

### Phase 2: Multi-Tenancy (Lower Priority, Future)

1. **Tenant registration**: Self-service tenant creation
2. **Tenant routing**: Subdomain or path-based
3. **Billing integration**: Usage tracking + Stripe
4. **Advanced features**: Custom domains, branding

**Goal**: SaaS platform for wedding photographers.

---

## Open Questions

1. **Album Slugs**: Auto-generate from name (e.g., "Wedding Ceremony" → "wedding-ceremony") or let user set?
2. **Default Album**: Should existing media automatically go to "default-album" or remain unassigned?
3. **R2 Migration**: Stay with flat structure or migrate to `albums/{id}/` prefixes?
4. **Authentication**: Use existing gallery password for all albums or require per-album passwords?
5. **Album Limit**: Should there be a max album count (e.g., 50 albums per tenant)?

---

## Success Metrics

### Phase 1
- [ ] All existing media accessible without migration
- [ ] New albums can be created via API/UI
- [ ] Media can be filtered by album
- [ ] Upload flow supports album selection
- [ ] No performance degradation (<100ms API responses)

### Phase 2
- [ ] Multiple tenants isolated (no data leakage)
- [ ] Tenant onboarding < 5 minutes
- [ ] 99.9% uptime (leveraging Cloudflare edge)
- [ ] Cost per tenant < $5/month (excluding storage)

---

## Conclusion

This design provides a **pragmatic, phased approach** to adding albums and multi-tenancy:

1. **Phase 1** (Immediate): Add albums with minimal disruption, backward-compatible
2. **Phase 2** (Future): Enable multi-tenancy when needed, building on album foundation

**Key Benefits**:
- Extensible without rewrite
- Leverages existing Cloudflare infrastructure
- Low complexity, high scalability
- Clear migration path

**Next Steps**:
1. Review this proposal with stakeholders
2. Answer open questions
3. Create GitHub issues for Phase 1A tasks
4. Implement database migration script
5. Begin Phase 1A development

---

**Document Version**: 1.0
**Last Updated**: 2025-11-05
**Author**: Claude (AI Assistant)
**Status**: Proposal - Awaiting Review
