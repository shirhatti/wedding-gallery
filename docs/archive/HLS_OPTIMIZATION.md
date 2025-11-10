# HLS Architecture & TTFB Optimization

> **STATUS (2024-11-10)**: ALL OPTIMIZATIONS IMPLEMENTED
>
> This was a design proposal document. All 5 optimizations have been successfully implemented:
> - ✅ Progressive manifest delivery (`generateProgressiveManifest()`)
> - ✅ Lazy segment signing (`/api/hls-segment/`)
> - ✅ Master playlist optimization (no signing)
> - ✅ Manifest-level caching (KV cache)
> - ✅ Parallel manifest generation (batch signing)
>
> For current operational details, see [HLS Implementation](../architecture/hls-implementation.md).
>
> This document is kept as historical reference showing the design rationale.

## How HLS Works

### Hierarchical Structure
```
master.m3u8                    ← Master playlist
├── 360p.m3u8                 ← Variant playlist (low quality)
│   ├── segment000.ts         ← 4-second video chunk
│   ├── segment001.ts
│   └── ...
├── 720p.m3u8                 ← Variant playlist (medium quality)
│   ├── segment000.ts
│   └── ...
└── 1080p.m3u8                ← Variant playlist (high quality)
    ├── segment000.ts
    └── ...
```

### Playback Flow
1. **Fetch master.m3u8** (~10-50ms)
   - Lists available quality variants
   - Player chooses one based on bandwidth

2. **Fetch variant playlist** (e.g., 720p.m3u8) (~10-300ms - THIS IS WHERE WE ARE SLOW)
   - Lists all segment URLs for that quality
   - Currently signing 150-600 URLs on cache miss

3. **Fetch first 2-3 segments** (~100-300ms)
   - Download segment000.ts, segment001.ts
   - Buffer enough for smooth playback

4. **START PLAYBACK** 🎉
   - Total TTFB: ~120-650ms

---

## Current Bottleneck: Variant Playlist Generation

When a player requests `720p.m3u8`, we currently:
1. Fetch the playlist from R2 (~10-20ms)
2. Parse all segment references (~1ms)
3. **Batch sign 150-600 URLs** (~150-300ms on cache miss) ⚠️ BOTTLENECK
4. Return the manifest

**Problem**: User waits ~150-300ms before playback can even start!

---

## Optimization 1: Progressive Manifest Delivery ⚡

### Key Insight
The player doesn't need ALL segment URLs immediately! It only needs:
- First 3-5 segments to start playback
- Remaining segments can be fetched later

### Implementation: Streaming Response
```typescript
// DON'T wait for all segments to be signed
// START sending manifest immediately with first few segments

async function handleVariantPlaylist(videoKey: string, variant: string) {
  const manifest = await fetchManifest(`hls/${videoKey}/${variant}.m3u8`);
  const lines = manifest.split('\n');

  // Identify first 5 segments
  const firstSegments = lines
    .filter(l => !l.startsWith('#'))
    .slice(0, 5);

  // Sign first 5 segments immediately (fast!)
  const firstUrls = await batchSign(firstSegments); // ~10-20ms

  // Start streaming response
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  // Send header + first 5 segments immediately
  writer.write(encodeManifestHeader(lines));
  writer.write(encodeSegments(firstUrls));

  // Sign remaining segments in background
  const remainingSegments = lines.slice(5);
  batchSign(remainingSegments).then(urls => {
    writer.write(encodeSegments(urls));
    writer.close();
  });

  return new Response(readable, { headers });
}
```

**TTFB Improvement**: ~150-300ms → ~20-40ms (8x faster!)

### Trade-offs
- ✅ Much faster playback start
- ✅ Player begins buffering while we sign remaining URLs
- ⚠️ More complex code
- ⚠️ Requires streaming response handling

---

## Optimization 2: Lazy Segment Signing

### Key Insight
We don't even need to sign segments upfront! We can proxy them on-demand:

```typescript
// Variant playlist uses worker URLs, not presigned URLs
// Example: /api/hls/myvideo/720p/segment042.ts

async function handleSegment(videoKey, quality, segmentFile) {
  // Check URL cache
  const cached = await getSignedUrl(cacheKey);
  if (cached) {
    return Response.redirect(cached, 302); // Redirect to R2
  }

  // Sign on-demand (cached for 4 hours)
  const signedUrl = await signR2Url(...);
  await cache.put(cacheKey, signedUrl);

  return Response.redirect(signedUrl, 302);
}
```

**Manifest generation time**: ~1ms (no signing!)
**Per-segment overhead**: ~10-20ms first time, then cached

### When This Works Best
- For infrequently watched videos (cache miss rate high anyway)
- When you want instant manifest responses
- When you don't mind slight latency on first segment fetch

---

## Optimization 3: Master Playlist Doesn't Need Signing!

### Current Issue
We're signing the master playlist references, but they're just variant playlist names:

```m3u8
#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360
360p.m3u8         ← This doesn't need signing! It's handled by the worker
#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720
720p.m3u8         ← This doesn't need signing!
```

### Fix
```typescript
async function handleMasterPlaylist(videoKey) {
  const manifest = await fetchManifest(`hls/${videoKey}/master.m3u8`);

  // Just rewrite variant references to worker URLs
  const rewritten = manifest.replace(
    /^([0-9]+p\.m3u8)$/gm,
    `/api/hls/${videoKey}/$1`
  );

  return new Response(rewritten, { headers });
  // Takes <5ms instead of 150-300ms!
}
```

**Master playlist TTFB**: ~5-10ms

---

## Optimization 4: Manifest-Level Caching

Cache the **entire rewritten manifest**, not individual URLs:

```typescript
const cacheKey = `manifest:${videoKey}:${variant}:${timeWindow}`;
const cached = await env.CACHE_VERSION.get(cacheKey);

if (cached) {
  return new Response(cached, { headers }); // ~10ms
}

// Generate and cache
const manifest = await generateSignedManifest(...); // ~150-300ms
await env.CACHE_VERSION.put(cacheKey, manifest, { expirationTtl: 14400 });

return new Response(manifest, { headers });
```

**Cache hit TTFB**: ~10ms (single KV read vs N reads)

---

## Optimization 5: Parallel Manifest Generation

The master playlist references multiple variants. We can generate them in parallel:

```typescript
// User might want any variant, so pre-warm cache
async function handleMasterPlaylist(videoKey) {
  const variants = ['360p', '720p', '1080p'];

  // Send master playlist immediately
  const master = generateMasterPlaylist(videoKey);

  // Pre-generate variant playlists in background (don't await!)
  Promise.all(
    variants.map(v => generateAndCacheVariantPlaylist(videoKey, v))
  ).catch(console.error);

  return new Response(master, { headers }); // ~5ms
}
```

---

## Recommended Architecture

### Phase 1: Quick Wins (30 minutes)
1. ✅ Stop signing master playlist variant references
2. ✅ Add manifest-level caching
3. ✅ Use optimized batch signer with cached signing key

**Result**: TTFB ~10ms (cache hit), ~150ms (cache miss)

### Phase 2: Advanced (2-3 hours)
4. Implement progressive manifest delivery
5. Add lazy segment signing option

**Result**: TTFB ~20-40ms even on cache miss

### Phase 3: Future (Consider)
6. R2 public custom domain (zero crypto)
7. Durable Objects for stateful signing key

**Result**: TTFB ~0-10ms

---

## Performance Comparison

| Approach | Master Playlist | Variant Playlist | First Segment | Total TTFB |
|----------|----------------|------------------|---------------|------------|
| **Current** | ~150ms | ~150-300ms | ~50ms | ~350-500ms |
| **+ Don't sign master** | ~10ms | ~150-300ms | ~50ms | ~210-360ms |
| **+ Manifest cache (hit)** | ~10ms | ~10ms | ~50ms | ~70ms 🎉 |
| **+ Progressive delivery** | ~10ms | ~20-40ms | ~50ms | ~80-100ms |
| **+ R2 public domain** | ~5ms | ~5ms | ~10ms | ~20ms 🚀 |

---

## HLS.js Buffering Behavior

Good news: HLS.js is smart about buffering:

```javascript
new Hls({
  maxBufferLength: 30,      // Buffer up to 30 seconds ahead
  maxMaxBufferLength: 600,  // Max 10 minutes
  maxBufferSize: 60 * 1000 * 1000, // 60 MB
  maxBufferHole: 0.5        // Allow 0.5s gaps
});
```

**Implication**: Once playback starts, the player aggressively buffers ahead.
We only need to optimize **time to first frame**, not total manifest generation time.

---

## Implementation Example: Quick Wins

```typescript
// 1. Master playlist - don't sign variant references
export async function handleMasterPlaylist(request, env) {
  const { videoKey } = parseRequest(request);
  const cacheKey = `manifest:master:${videoKey}:${timeWindow}`;

  // Check cache
  const cached = await env.CACHE_VERSION.get(cacheKey);
  if (cached) {
    return new Response(cached, { headers, 'X-Cache': 'HIT' });
  }

  // Fetch and rewrite
  const manifest = await env.R2_BUCKET.get(`hls/${videoKey}/master.m3u8`);
  const content = await manifest.text();

  // Rewrite variant references to worker URLs (no signing needed!)
  const rewritten = content.replace(
    /^([0-9]+p\.m3u8)$/gm,
    `/api/hls/${videoKey}/$1`
  );

  // Cache for 4 hours
  await env.CACHE_VERSION.put(cacheKey, rewritten, { expirationTtl: 14400 });

  return new Response(rewritten, { headers, 'X-Cache': 'MISS' });
}

// 2. Variant playlist - manifest-level cache
export async function handleVariantPlaylist(request, env) {
  const { videoKey, variant } = parseRequest(request);
  const timeWindow = Math.floor(Date.now() / 1000 / 14400);
  const cacheKey = `manifest:${videoKey}:${variant}:${timeWindow}`;

  // Check manifest cache (fastest path)
  const cached = await env.CACHE_VERSION.get(cacheKey);
  if (cached) {
    return new Response(cached, { headers, 'X-Cache': 'HIT' });
  }

  // Generate manifest with optimized batch signing
  const manifest = await env.R2_BUCKET.get(`hls/${videoKey}/${variant}.m3u8`);
  const content = await manifest.text();
  const segments = parseSegments(content);

  // Batch sign with cached signing key
  const signedUrls = await ultraOptimizedBatchSign(
    env.CACHE_VERSION,
    signingConfig,
    segments,
    14400
  );

  const rewritten = reconstructManifest(content, signedUrls);

  // Cache entire manifest
  await env.CACHE_VERSION.put(cacheKey, rewritten, { expirationTtl: 12960 });

  return new Response(rewritten, { headers, 'X-Cache': 'MISS' });
}
```

---

## Conclusion

**You're absolutely right** - we don't need to generate the entire manifest a priori!

The fastest path to playback is:
1. Master playlist: ~10ms (just rewrite variant names, don't sign)
2. Variant playlist: ~10ms (cache hit) or ~150ms (cache miss with batch signing)
3. First segment: ~50ms

**Total TTFB: ~70ms (cached) or ~210ms (cold)**

This is much better than the current ~350-500ms!
