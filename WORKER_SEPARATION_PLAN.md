# Worker Separation: Video Streaming vs Media Serving

## Current Architecture
```
┌─────────────────────────────────────┐
│     Single "viewer" Worker          │
│  ┌────────────────────────────────┐ │
│  │ /api/media (list + thumbnails) │ │
│  │ /api/file/* (images)           │ │
│  │ /api/thumbnail/*               │ │
│  │ /api/hls/playlist (master)     │ │
│  │ /api/hls/*/*.m3u8 (variants)   │ │
│  │ /api/hls/*/*.ts (segments)     │ │
│  │ /login (auth)                  │ │
│  └────────────────────────────────┘ │
└─────────────────────────────────────┘
```

## Proposed Architecture
```
┌──────────────────────────┐    ┌──────────────────────────────┐
│   "viewer" Worker        │    │  "video-streaming" Worker    │
│ ┌──────────────────────┐ │    │ ┌──────────────────────────┐ │
│ │ /api/media           │ │    │ │ /api/hls/playlist        │ │
│ │ /api/file/*          │ │    │ │ /api/hls/*/*.m3u8        │ │
│ │ /api/thumbnail/*     │ │    │ │ /api/hls/*/*.ts          │ │
│ │ /api/cache-version   │ │    │ │ (video serving ONLY)     │ │
│ │ /login               │ │    │ └──────────────────────────┘ │
│ └──────────────────────┘ │    └──────────────────────────────┘
└──────────────────────────┘
         │                              │
         └──────────────┬───────────────┘
                        │
                ┌───────▼────────┐
                │   Pages SPA    │
                │  (gallery UI)  │
                └────────────────┘
```

---

## Separation Plan

### Worker 1: `viewer` (Media & Auth)
**Purpose**: Images, thumbnails, media listing, authentication

**Endpoints**:
- `GET /api/media` - List media with thumbnail URLs
- `GET /api/file/:key` - Serve original images
- `GET /api/thumbnail/:key` - Serve thumbnails
- `GET /api/cache-version` - Cache version for thumbnails
- `POST /login` - Authentication
- `GET /auth` - Auth status

**Bindings**:
- R2_BUCKET (read images/thumbnails)
- DB (D1 database)
- CACHE_VERSION (KV namespace)
- GALLERY_PASSWORD, AUTH_SECRET (vars)

**Characteristics**:
- ✅ Low CPU usage (no crypto)
- ✅ I/O-intensive
- ✅ Simpler caching logic
- ✅ Authentication logic isolated

---

### Worker 2: `video-streaming` (HLS Only)
**Purpose**: Video streaming with optimized HLS manifest generation

**Endpoints**:
- `GET /api/hls/playlist?key=:key` - Master playlist
- `GET /api/hls/:key/:variant.m3u8` - Variant playlists
- `GET /api/hls/:key/:segment.ts` - Video segments

**Bindings**:
- R2_BUCKET (read video/HLS files)
- VIDEO_CACHE (dedicated KV namespace for video caching)
- R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (signing credentials)
- R2_REGION, R2_BUCKET_NAME, R2_ACCOUNT_ID

**Characteristics**:
- ⚡ CPU-intensive (HMAC signing)
- 📊 Bursty traffic (150-600 requests at once)
- 🎯 Specialized batch signing logic
- 💾 Aggressive caching (4-hour TTLs)

---

## Benefits

### 1. Performance Isolation
```
Before (single worker):
- Video cache miss triggers 1,200 HMAC operations
- Image requests queued behind video signing
- CPU bottleneck affects all traffic

After (separate workers):
- Video signing isolated to dedicated isolate
- Image serving unaffected by video load
- Independent scaling per workload
```

### 2. Optimized Caching
```typescript
// viewer worker - simple caching
env.CACHE_VERSION (shared KV for cache versioning)

// video-streaming worker - aggressive video caching
env.VIDEO_CACHE (dedicated KV namespace)
- Manifest cache
- URL cache
- Signing key cache
```

### 3. Independent Deployment
```bash
# Deploy video improvements without touching images
cd workers/video-streaming
wrangler deploy

# Deploy image changes without touching video
cd workers/viewer
wrangler deploy
```

### 4. Better Monitoring
```
Cloudflare Analytics:
- viewer: Request count, response time, errors (images/thumbnails)
- video-streaming: Request count, CPU time, cache hit rate (HLS)
```

---

## Migration Steps

### Phase 1: Create video-streaming Worker (2-3 hours)
1. Create new directory: `workers/video-streaming`
2. Copy HLS-related code from `viewer`
3. Configure new wrangler.toml with:
   - Dedicated KV namespace (VIDEO_CACHE)
   - R2 bucket binding
   - Signing credentials

### Phase 2: Update viewer Worker (1 hour)
1. Remove HLS endpoints from `viewer/src/index.ts`
2. Keep only: /api/media, /api/file, /api/thumbnail, /login
3. Simplify dependencies (remove signing logic)

### Phase 3: Update Pages SPA (30 minutes)
1. Add `VIDEO_API_BASE` environment variable
2. Update video player to use video-streaming worker
```typescript
// Before
const hlsUrl = `${API_BASE}/api/hls/playlist?key=${key}`;

// After
const VIDEO_API = import.meta.env.VITE_VIDEO_API_BASE || API_BASE;
const hlsUrl = `${VIDEO_API}/api/hls/playlist?key=${key}`;
```

### Phase 4: Configure Routing (15 minutes)
Update `wrangler.toml` or Cloudflare dashboard:
```toml
# Option 1: Separate subdomains
viewer.yourdomain.com → viewer worker
video.yourdomain.com → video-streaming worker

# Option 2: Path-based routing (if using a route)
yourdomain.com/api/hls/* → video-streaming worker
yourdomain.com/* → viewer worker
```

### Phase 5: Test & Deploy (1 hour)
1. Test both workers independently
2. Deploy to staging
3. Verify:
   - Image loading works
   - Video playback works
   - Authentication works
4. Deploy to production

---

## File Structure

```
wedding-gallery/
├── workers/
│   ├── viewer/                  # Images, thumbnails, auth
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── handlers/
│   │   │   │   ├── home.ts
│   │   │   │   └── media.ts
│   │   │   └── lib/
│   │   ├── wrangler.toml
│   │   └── package.json
│   │
│   └── video-streaming/         # HLS video only
│       ├── src/
│       │   ├── index.ts
│       │   ├── handlers/
│       │   │   └── hls.ts
│       │   └── lib/
│       │       ├── batch-r2-signer.ts
│       │       ├── optimized-batch-signer.ts
│       │       └── r2-signer.ts
│       ├── wrangler.toml
│       └── package.json
│
└── pages/
    └── gallery/                 # SPA (calls both workers)
```

---

## Configuration Examples

### `workers/video-streaming/wrangler.toml`
```toml
name = "video-streaming"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "wedding-photos"

[[kv_namespaces]]
binding = "VIDEO_CACHE"
id = "new-kv-namespace-id"
preview_id = "new-preview-id"

# Optimized for video workload
[limits]
cpu_ms = 50  # Allow more CPU time for signing operations
```

### `workers/viewer/wrangler.toml`
```toml
name = "viewer"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "wedding-photos"

[[d1_databases]]
binding = "DB"
database_name = "wedding-photos-metadata"
database_id = "150012ba-e8d4-4e02-8769-aafd24fe08d0"

[[kv_namespaces]]
binding = "CACHE_VERSION"
id = "cf132b95f9434658b98935f880a0b299"

# Optimized for I/O workload
[limits]
cpu_ms = 10  # Images don't need much CPU
```

---

## Cost Impact

### Before (single worker):
- 1 worker with mixed workload
- Shared KV namespace
- CPU spikes from video signing affect all requests

### After (separate workers):
- 2 workers with specialized workloads
- Dedicated KV namespaces
- **Cost**: ~same (KV reads cost the same, worker invocations minimal)
- **Benefit**: Better performance, easier scaling

### KV Namespace Usage:
```
CACHE_VERSION (viewer):
- auth_version
- thumbnail_version
- Other shared metadata

VIDEO_CACHE (video-streaming):
- manifest:master:*
- manifest:variant:*
- signed:*
- signing-key:*
```

---

## Rollback Plan

If issues arise:
1. Route all traffic back to `viewer` worker
2. `video-streaming` worker can remain deployed (dormant)
3. No data loss (both workers share same R2 bucket)

---

## Long-term Benefits

### 1. Specialized Optimization
- Video worker can use WebAssembly for faster crypto
- Image worker can add on-the-fly resizing
- Each optimized independently

### 2. A/B Testing
- Test new video signing approaches without affecting images
- Compare performance of different manifest generation strategies

### 3. Future Enhancements
- Add CDN in front of video worker only
- Use Durable Objects for video-streaming stateful caching
- Keep viewer simple and fast

---

## Recommendation

**✅ Yes, separate the workers!**

The benefits outweigh the minimal added complexity:
- Better performance isolation
- Easier to debug and monitor
- Independent deployment
- Specialized optimization

Estimated effort: **4-5 hours** for complete separation and testing.

Next steps:
1. Create `workers/video-streaming` directory
2. Move HLS handlers to new worker
3. Update Pages SPA to use both endpoints
4. Test and deploy
