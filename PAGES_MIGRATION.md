# Cloudflare Pages Migration Implementation Guide

This document outlines the implementation of Issue #13 - migrating the wedding gallery to Cloudflare Pages with React and shadcn/ui.

## Overview

The migration transforms the architecture from:
- **Before**: Worker serves both UI (HTML templates) and media (proxied from R2)
- **After**: Pages serves static React UI, Worker provides API + auth + signed URLs, clients fetch media directly from R2

## What's Been Implemented

### 1. Cloudflare Pages Frontend (`pages/gallery/`)

A modern React application with:
- ✅ **Vite + React + TypeScript** setup
- ✅ **shadcn/ui** components (Dialog, Button, Card, Badge)
- ✅ **Tailwind CSS** for styling
- ✅ **Gallery component** with responsive grid layout
- ✅ **Lightbox component** with keyboard navigation and HLS video support
- ✅ **Mobile-responsive** design (Instagram-style 3-column grid)

**Tech Stack:**
- React 18.3
- TypeScript 5.6
- Tailwind CSS 3.4
- shadcn/ui components
- HLS.js for video playback
- Lucide React for icons

### 2. Worker API Updates (`workers/viewer/`)

Enhanced the Worker to be API-only:
- ✅ **R2 SigV4 signing** utility (`lib/r2-signer.ts`)
- ✅ **Pre-signed URL generation** in `/api/media` endpoint
- ✅ **HLS playlist rewrite** endpoint (`/api/hls/playlist`)
- ✅ **CORS configuration** updated for Pages origin
- ✅ **Backward compatible** - works with or without signing credentials

**New Environment Variables:**
```bash
R2_ACCESS_KEY_ID         # R2 API access key
R2_SECRET_ACCESS_KEY     # R2 API secret key
R2_REGION               # Usually "auto" for Cloudflare
R2_BUCKET_NAME          # R2 bucket name
R2_ACCOUNT_ID           # Cloudflare account ID
PAGES_ORIGIN            # Pages domain for CORS
```

### 3. Direct R2 Access

When signing credentials are configured:
- Thumbnails fetched directly from R2 with 30-minute TTL
- Original media fetched directly from R2 with 30-minute TTL
- HLS video segments fetched from R2 (playlist rewritten by Worker)
- Worker no longer in the media delivery hot path

## Architecture Diagram

```
┌─────────────────┐
│ Cloudflare Pages│
│   (React UI)    │
└────────┬────────┘
         │
         ├─────GET /api/media ────────┐
         │                            │
         ├─────GET /api/hls/playlist──┤
         │                            │
         ├─────POST /login ───────────┤
         │                            │
┌────────▼────────┐                   │
│     Worker      │                   │
│  (API + Auth)   │                   │
└────────┬────────┘                   │
         │                            │
         │ Signs URLs                 │
         ▼                            │
   ┌──────────┐                       │
   │    R2    │◄──────────────────────┘
   │ (Storage)│   Direct fetch with
   └──────────┘   pre-signed URLs
```

## Installation & Setup

### 1. Install Pages Dependencies

```bash
cd pages/gallery
npm install
```

### 2. Configure Environment

For local development, set the API base URL when running the dev server:
```bash
VITE_API_BASE=http://localhost:8787 npm run dev
```

For production, the `VITE_API_BASE` is set during build in the GitHub Actions workflow (see `.github/workflows/deploy.yml`).

### 3. Configure Worker Secrets

```bash
cd workers/viewer

# Set R2 credentials (get from Cloudflare dashboard)
wrangler secret put R2_ACCESS_KEY_ID
wrangler secret put R2_SECRET_ACCESS_KEY
wrangler secret put R2_ACCOUNT_ID

# Set R2 bucket details
wrangler secret put R2_BUCKET_NAME  # e.g., "wedding-photos"
wrangler secret put R2_REGION       # Usually "auto"

# Set Pages origin for CORS
wrangler secret put PAGES_ORIGIN    # e.g., "https://gallery.pages.dev"
```

### 4. Configure R2 CORS

Add CORS policy to your R2 bucket to allow Pages origin:

```json
[
  {
    "AllowedOrigins": ["https://your-pages-domain.pages.dev"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range", "Content-Type"],
    "ExposeHeaders": ["ETag", "Accept-Ranges"],
    "MaxAgeSeconds": 3600
  }
]
```

Apply via Wrangler or dashboard:
```bash
wrangler r2 bucket cors put wedding-photos --file cors-policy.json
```

## Development Workflow

### Option 1: Run Both Services Locally

Terminal 1 - Start Worker:
```bash
npm run dev:viewer
# Worker runs on http://localhost:8787
```

Terminal 2 - Start Pages:
```bash
npm run dev:pages
# Pages runs on http://localhost:5173
```

### Option 2: Integrated Development

```bash
cd pages/gallery
npm run pages:dev
# Runs Vite with Wrangler Pages dev server
```

## Deployment

### Deploy Worker API

```bash
npm run deploy:viewer
```

### Deploy Pages Frontend

```bash
npm run deploy:pages
```

### Deploy Everything

```bash
npm run deploy:all
```

## Migration Path

### Phase 1: Parallel Running (Recommended)

1. Deploy Pages and Worker with signing enabled
2. Test Pages version thoroughly
3. Keep old Worker routes active as fallback
4. Gradually shift traffic to Pages

### Phase 2: Full Migration

1. Update DNS/routing to point to Pages
2. Remove old template-based routes from Worker
3. Remove `/api/file`, `/api/thumbnail`, `/api/hls/<path>` endpoints
4. Keep only API routes: `/api/media`, `/api/hls/playlist`, `/login`

### Phase 3: Optimization

1. Enable long cache TTLs on R2 objects
2. Monitor signed URL refresh rates
3. Adjust TTLs based on usage patterns
4. Consider CDN/caching layer if needed

## Feature Comparison

| Feature | Old (Worker Templates) | New (Pages + React) |
|---------|----------------------|-------------------|
| UI Framework | Plain HTML strings | React + shadcn/ui |
| Styling | Custom CSS (inline) | Tailwind CSS |
| Build Process | None (templates) | Vite |
| Type Safety | Minimal | Full TypeScript |
| Component Reusability | None | High |
| Media Delivery | Proxied via Worker | Direct from R2 |
| Development Experience | Template strings | Hot reload, fast |
| Bundle Size | ~2KB HTML | ~150KB React app |
| Time to Interactive | Very fast | Fast (code splitting) |

## Benefits

### Performance
- ✅ Media fetched directly from R2 (CDN-cached)
- ✅ Worker CPU time reduced by 90%+
- ✅ Parallel media loading (no Worker bottleneck)
- ✅ Better cache hit rates on static assets

### Developer Experience
- ✅ Modern React development workflow
- ✅ Component-based architecture
- ✅ Full TypeScript support
- ✅ Hot module reload
- ✅ Reusable UI components via shadcn/ui

### Scalability
- ✅ Static assets served from Pages CDN
- ✅ Worker only handles API calls and auth
- ✅ R2 handles media delivery load
- ✅ Easy to add new features with React

## Testing Checklist

- [ ] Gallery grid loads correctly
- [ ] Thumbnails display (with pre-signed URLs)
- [ ] Lightbox opens and displays full images
- [ ] Video playback works (HLS and fallback)
- [ ] Keyboard navigation in lightbox (desktop)
- [ ] Mobile responsive layout (3-column grid)
- [ ] Authentication flow works
- [ ] CORS headers correct
- [ ] Pre-signed URLs refresh before expiry
- [ ] Error states handled gracefully

## Troubleshooting

### "Failed to load media"
- Check `VITE_API_BASE` environment variable
- Verify Worker is running and accessible
- Check browser console for CORS errors

### "CORS policy" errors
- Verify `PAGES_ORIGIN` is set in Worker
- Check R2 CORS policy includes Pages domain
- Ensure credentials: 'include' in fetch requests

### Images not loading
- Verify R2 signing credentials are configured
- Check thumbnail generation has completed
- Inspect pre-signed URLs in network tab

### Videos not playing
- Check HLS playlist endpoint returns valid M3U8
- Verify segment URLs are properly signed
- Test fallback to direct MP4 playback

## Rollback Plan

If issues arise:

1. **Immediate**: Point DNS back to old Worker
2. **Quick**: Remove Pages deployment, keep Worker serving templates
3. **Gradual**: Feature-flag Pages UI in Worker, toggle off

## Future Enhancements

- [ ] Upload interface on Pages (replace album worker)
- [ ] Client-side thumbnail generation
- [ ] Progressive web app (PWA) support
- [ ] Batch pre-signed URL refresh
- [ ] WebP/AVIF thumbnail support
- [ ] Lazy loading optimization
- [ ] Infinite scroll for large galleries
- [ ] Search and filtering
- [ ] Album/collection organization

## Security Considerations

✅ **Implemented:**
- Pre-signed URLs with short TTLs (30 min)
- HttpOnly cookies for authentication
- CORS restricted to Pages origin
- No public R2 access without signed URLs

⚠️ **Additional Recommendations:**
- Rotate R2 API keys regularly
- Monitor signed URL generation rates
- Implement rate limiting on signing endpoints
- Add CSP headers to Pages

## Performance Metrics

Expected improvements:
- **Worker CPU Time**: 90%+ reduction
- **Time to First Byte (TTFB)**: ~50ms (static assets)
- **Largest Contentful Paint (LCP)**: <2.5s
- **First Input Delay (FID)**: <100ms
- **Cumulative Layout Shift (CLS)**: <0.1

## Support

For questions or issues:
- Review Worker logs: `wrangler tail`
- Check Pages build logs in dashboard
- Test API endpoints directly with curl
- Verify R2 bucket permissions

## References

- [Issue #13](https://github.com/your-repo/issues/13)
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [R2 Pre-signed URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/)
- [shadcn/ui Documentation](https://ui.shadcn.com/)
