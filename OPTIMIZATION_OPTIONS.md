# Video Signing Performance Optimization Options

## Current Implementation: Batch Signing with URL Cache
- **Cache hit**: ~10-30ms (parallel KV reads)
- **Cache miss**: ~150-300ms for 600 segments (1,204 HMAC operations)

---

## Option 1: Cache the Signing Key ⭐ RECOMMENDED
**File**: `optimized-batch-signer.ts` (already implemented)

### How It Works
The AWS Signature V4 signing key is derived from:
- Secret key
- Date (YYYYMMDD format)
- Region
- Service name

The key is **identical for all URLs signed on the same day**. We can cache it in KV for 24 hours.

### Performance Impact
- **Eliminates**: 4 serialized HMAC operations per batch
- **Cache miss time**: ~150-300ms → ~145-290ms (600 segments)
- **Marginal improvement**, but removes a bottleneck and allows pure parallelization

### Implementation Cost
- ✅ Simple - just swap `batchSignWithCache` → `ultraOptimizedBatchSign`
- ✅ Secure - signing key stored as base64 in KV, expired after 24h
- ✅ No architectural changes

### Code Change
```typescript
// In hls.ts and index.ts, replace:
import { batchSignWithCache } from '../lib/batch-r2-signer';
// With:
import { ultraOptimizedBatchSign } from '../lib/optimized-batch-signer';

// Then use:
const signedUrls = await ultraOptimizedBatchSign(
  env.CACHE_VERSION,
  signingConfig,
  segmentKeys,
  14400
);
```

---

## Option 2: Cache Entire Manifests 🚀 BIGGEST WIN
**Impact**: Single KV read instead of N KV reads

### How It Works
Instead of caching individual signed URLs, cache the **entire rewritten manifest**:

```typescript
const manifestCacheKey = `manifest:${videoKey}:${timeWindow}`;
const cached = await env.CACHE_VERSION.get(manifestCacheKey);
if (cached) {
  return new Response(cached, { headers: { ... } });
}

// Otherwise, generate and cache the manifest
const rewrittenManifest = await generateManifest(...);
await env.CACHE_VERSION.put(manifestCacheKey, rewrittenManifest, {
  expirationTtl: 14400 * 0.9
});
```

### Performance Impact
- **Cache hit**: ~10ms (single KV read) vs ~10-30ms (N parallel reads)
- **Cache miss**: Same as current (~150-300ms)
- **Network efficiency**: One KV operation vs 600

### Trade-offs
- ✅ Simpler caching strategy
- ✅ Faster cache hits
- ⚠️ Less granular (can't reuse individual URL signatures across different manifests)
- ⚠️ Larger KV values (full manifests vs individual URLs)

### When to Use
- Best for **master playlists** and **variant playlists** (relatively small)
- Less ideal for sharing signed segments across multiple videos

---

## Option 3: R2 Public Custom Domain 🌐 ZERO CRYPTO
**Impact**: Eliminates ALL signing operations

### How It Works
1. Set up R2 public custom domain (e.g., `cdn.yoursite.com`)
2. Make HLS content publicly accessible
3. Use direct URLs instead of presigned URLs

```typescript
// No signing needed!
const segmentUrl = `https://cdn.yoursite.com/hls/${videoKey}/segment001.ts`;
```

### Performance Impact
- **All requests**: ~0ms (no crypto operations at all)
- **Manifest generation**: <10ms (just string replacement)

### Trade-offs
- ✅ **Fastest possible** - zero overhead
- ✅ Simplest code
- ✅ Native CDN caching
- ⚠️ Requires custom domain setup
- ⚠️ HLS content must be public (or use Cloudflare Access for auth)
- ⚠️ Different security model

### When to Use
- If HLS content can be public
- If you have a custom domain
- If you want maximum performance

### Setup
```toml
# wrangler.toml
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "wedding-photos"
jurisdiction = "eu"
# Set up custom domain in Cloudflare dashboard
```

---

## Option 4: Dedicated Signing Service
**Impact**: Offload crypto to specialized infrastructure

### Approaches

#### A. Cloudflare Durable Objects
- Stateful objects can keep signing key in memory
- No KV reads needed for signing key
- More expensive ($0.15/million requests vs KV's $0.50/million reads)

#### B. External Microservice
- Dedicated signing service (e.g., Rust/Go for faster crypto)
- Shared across all workers
- Adds network latency (~10-50ms)

#### C. Cloudflare Workers AI (Future)
- If WebGPU crypto becomes available
- Potential for GPU-accelerated HMAC

### Trade-offs
- ⚠️ More complexity
- ⚠️ Additional cost
- ⚠️ Network latency (for external services)
- ✅ Could be faster for crypto operations
- ✅ Centralized caching

---

## Performance Comparison Table

| Approach | Cache Hit | Cache Miss (600 segments) | Complexity | Cost |
|----------|-----------|---------------------------|------------|------|
| **Current** | ~10-30ms | ~150-300ms | Low | $ |
| **+ Cached Signing Key** | ~10-30ms | ~145-290ms | Low | $ |
| **+ Manifest Cache** | ~10ms | ~150-300ms | Medium | $ |
| **R2 Public Domain** | ~0ms | ~0ms | Medium | $ |
| **Durable Objects** | ~5-15ms | ~100-200ms | High | $$ |
| **External Service** | ~20-50ms | ~120-250ms | High | $$$ |

---

## Recommendation

### For Immediate Deployment
**Option 1 + Option 2**: Cached signing key + manifest caching
- Easy to implement
- Best performance for effort
- No architectural changes

### For Long-term
**Option 3**: R2 Public Custom Domain (if content can be public)
- Zero crypto overhead
- Native CDN performance
- Simplest architecture

---

## Implementation Priority

1. ✅ **Done**: Batch signing with URL caching
2. 🔄 **Next**: Add manifest-level caching (15 minutes)
3. 🔄 **Optional**: Add signing key caching (10 minutes)
4. 🔍 **Evaluate**: R2 public custom domain (if security model allows)

---

## Example: Full Optimization Stack

```typescript
// Triple-layer optimization:
// 1. Manifest cache (fastest)
// 2. URL cache (fast)
// 3. Signing key cache (faster crypto on misses)

export async function handleHLSPlaylist(...) {
  const manifestCacheKey = `manifest:${videoKey}:${timeWindow}`;

  // Layer 1: Check manifest cache
  const cachedManifest = await env.CACHE_VERSION.get(manifestCacheKey);
  if (cachedManifest) {
    return new Response(cachedManifest, { headers });
  }

  // Layer 2 & 3: Generate with URL cache + signing key cache
  const signedUrls = await ultraOptimizedBatchSign(
    env.CACHE_VERSION,
    signingConfig,
    segmentKeys,
    14400
  );

  const manifest = reconstructManifest(lines, signedUrls);

  // Cache the manifest
  await env.CACHE_VERSION.put(manifestCacheKey, manifest, {
    expirationTtl: cacheTtl
  });

  return new Response(manifest, { headers });
}
```

This achieves:
- **Cache hit**: ~10ms (single KV read)
- **Cache miss**: ~145-290ms (optimized batch signing)
- **Cold start**: ~145-290ms (first request ever)
