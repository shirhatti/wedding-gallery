# Two-Bucket Architecture Setup

## Overview

The wedding gallery uses a two-bucket architecture for public/private media separation:

- **Public Bucket** (`wedding-photos-public`): Anonymous read access, serves public media
- **Private Bucket** (`wedding-photos-private`): Requires authentication, serves private media

## Architecture Benefits

1. **Infrastructure-Level Security**: Public bucket is truly public, private bucket is truly private
2. **No Database Queries for Auth**: Bucket selection is based on route/scope, not database flags
3. **Performance**: Public media can use direct R2 URLs, bypassing worker proxy
4. **Defense in Depth**: Impossible to accidentally leak private content

## Bucket Setup

### 1. Create Public Bucket ✅ COMPLETED

```bash
# Create the bucket
npx wrangler r2 bucket create wedding-photos-public

# Enable r2.dev public URL
npx wrangler r2 bucket dev-url enable wedding-photos-public

# Add custom domain (optional but recommended)
npx wrangler r2 bucket domain add wedding-photos-public \
  --domain media.jessandsourabh.com \
  --zone-id 24615807bdd9acc6e3c501153d5c942c
```

**Current Setup:**
- R2.dev URL: `https://pub-8e1898068aa844eab4e3d600cc2f5a27.r2.dev`
- Custom Domain: `https://media.jessandsourabh.com` ✅

### 2. Configure Environment Variables ✅ COMPLETED

The public bucket URL has been set using wrangler secrets:

```bash
# Viewer worker
cd workers/viewer
npx wrangler secret put PUBLIC_BUCKET_URL <<< "https://media.jessandsourabh.com"

# Video streaming worker
cd workers/video-streaming
npx wrangler secret put PUBLIC_BUCKET_URL <<< "https://media.jessandsourabh.com"

# Pages project
npx wrangler pages secret put PUBLIC_BUCKET_URL \
  --project-name jessandsourabh <<< "https://media.jessandsourabh.com"
```

**For Local Development:**

The dev scripts in package.json already include the PUBLIC_BUCKET_URL variable:
- `workers/viewer/package.json` - includes `--var PUBLIC_BUCKET_URL:https://media.jessandsourabh.com`
- `workers/video-streaming/package.json` - includes `--var PUBLIC_BUCKET_URL:https://media.jessandsourabh.com`

### 3. Update Wrangler Deployments

The wrangler configs already bind both buckets. Deploy the workers:

```bash
# Deploy viewer worker
cd workers/viewer
npx wrangler deploy

# Deploy video-streaming worker
cd workers/video-streaming
npx wrangler deploy

# Deploy Pages
cd pages/gallery
npm run build
npx wrangler pages deploy dist
```

## How It Works

### Route → Scope → Bucket Mapping

| Route | Scope | Bucket | Auth Required |
|-------|-------|--------|---------------|
| `/`, `/images`, `/videos` | `public` | `wedding-photos-public` | No |
| `/private`, `/private/images`, `/private/videos` | `private` | `wedding-photos-private` | Yes |

### API Flow

**Public Request:**
```
Frontend calls: /api/media?scope=public
├─ Viewer worker receives scope=public
├─ No auth check required
├─ Queries R2_BUCKET_PUBLIC
└─ Returns media with direct R2 URLs (if PUBLIC_BUCKET_URL set)
```

**Private Request:**
```
Frontend calls: /api/media (no scope param)
├─ Viewer worker defaults to scope=private
├─ Validates auth cookie/token
├─ Queries R2_BUCKET_PRIVATE
└─ Returns media with worker proxy URLs or pre-signed URLs
```

## Making Media Public

Use the `make-public.mjs` script to copy media from private to public bucket:

```bash
# Example: Make a video public
node scripts/make-public.mjs Dances-002.mp4

# Example: Make an image public
node scripts/make-public.mjs 1758739736033-IMG_2797.jpeg
```

The script will:
1. Verify the media exists in the database
2. Copy the original file from private to public bucket
3. Copy all thumbnails (small, medium, large)
4. Copy all HLS segments (for videos)

## Database Changes

✅ The `is_public` column has been removed from both the schema and production database. No migration needed - the database is ready for the two-bucket architecture.

## URL Resolver Service

The frontend uses a centralized URL resolver (`src/lib/mediaUrlResolver.ts`) that:

- Constructs all media URLs based on scope
- Prefers direct R2 URLs for public media (when PUBLIC_BUCKET_URL is set)
- Falls back to worker proxy for private media
- Handles HLS playlist URLs with auth tokens

### Example Usage

```typescript
import { getThumbnailUrl, getOriginalUrl } from '@/lib/mediaUrlResolver'

// Get thumbnail URL for public media
const thumbUrl = getThumbnailUrl(item, 'public', 'medium')

// Get original URL for private media
const originalUrl = getOriginalUrl(item, 'private')
```

## Deployment Checklist

- [x] Create `wedding-photos-public` R2 bucket
- [x] Enable public access on public bucket (custom domain: media.jessandsourabh.com)
- [x] Set `PUBLIC_BUCKET_URL` environment variable
- [x] Remove `is_public` column from database
- [ ] Deploy viewer worker
- [ ] Deploy video-streaming worker
- [ ] Deploy Pages application
- [ ] Copy existing public media to public bucket using `make-public.mjs`
- [ ] Verify public routes work without authentication
- [ ] Verify private routes require authentication

## Troubleshooting

### Public media not loading

1. Check PUBLIC_BUCKET_URL is set correctly
2. Verify public bucket has "Allow Access" enabled
3. Check browser console for CORS errors

### Private media accessible without auth

1. Verify DISABLE_AUTH is not set to "true" in production
2. Check GALLERY_PASSWORD and AUTH_SECRET are configured
3. Verify cookies are being sent (`credentials: 'include'`)

### Videos not playing

1. For public videos: Check HLS files were copied to public bucket
2. For private videos: Verify auth token is being appended to HLS URLs
3. Check browser console for 401 errors
