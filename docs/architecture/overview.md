# Architecture Overview

The Wedding Gallery is a serverless photo and video sharing platform built entirely on Cloudflare's edge infrastructure. This document provides a high-level overview of the system architecture.

## System Components

### Frontend: Cloudflare Pages

A modern React-based single-page application (SPA) that provides the gallery interface.

**Technology Stack:**
- React 18 with TypeScript
- Vite build tool
- Tailwind CSS for styling
- shadcn/ui component library
- HLS.js for video playback

**Key Features:**
- Responsive grid layout
- Lightbox with keyboard navigation
- Lazy loading for optimal performance
- Mobile-optimized interface

See [Frontend Setup](../development/frontend-setup.md) for development details.

### Backend: Cloudflare Workers

Three specialized workers handle different aspects of the backend:

#### 1. Viewer Worker
**Purpose:** Media delivery, authentication, and API endpoints

**Endpoints:**
- `GET /api/media` - List media with metadata
- `GET /api/file/:key` - Serve original images (fallback)
- `GET /api/thumbnail/:key` - Serve thumbnails (fallback)
- `POST /login` - Authentication
- `GET /api/cache-version` - Cache version management

**Characteristics:**
- I/O-intensive workload
- Low CPU usage
- Direct R2 access for media

#### 2. Video Streaming Worker
**Purpose:** HLS video streaming with optimized manifest generation

**Endpoints:**
- `GET /api/hls/playlist?key=:key` - Master playlist
- `GET /api/hls/:key/:variant.m3u8` - Variant playlists
- `GET /api/hls/:key/:segment.ts` - Video segments

**Characteristics:**
- CPU-intensive (presigned URL generation)
- Aggressive caching (4-hour TTL)
- Batch signing optimizations
- Dedicated KV namespace for video caching

#### 3. Album Worker
**Purpose:** Guest photo/video uploads

**Endpoints:**
- `GET /upload` - Upload interface
- `POST /upload` - Handle file uploads

**Characteristics:**
- Processes uploads to R2
- Queues media for thumbnail generation
- Extracts EXIF metadata

See [Pages Migration](pages-migration.md) for architectural evolution details.

### Storage Layer

#### Cloudflare R2 (Object Storage)

Primary media storage with the following structure:

```
wedding-photos/
├── {original-files}                # Original photos and videos
├── thumbnails/
│   ├── small/{key}                # 150px thumbnails
│   ├── medium/{key}               # 400px thumbnails
│   └── large/{key}                # 800px thumbnails
└── hls/
    └── {videoKey}/
        ├── master.m3u8            # Master playlist
        ├── {quality}.m3u8         # Variant playlists
        └── {quality}_*.ts         # Video segments
```

**Access Patterns:**
- Presigned URLs for direct client access (30-minute TTL)
- Worker proxy fallback when presigning unavailable
- CORS configured for Pages origin

#### Cloudflare D1 (SQL Database)

Stores media metadata and processing state:

**Tables:**
- `media` - Media files with metadata (filename, type, size, timestamps)
- `pending_thumbnails` - Queue for thumbnail generation

**Access Patterns:**
- Read-heavy workload
- Indexed by upload date for chronological display
- EXIF data stored for photos

#### Cloudflare KV (Key-Value Store)

Two namespaces for different caching needs:

**CACHE_VERSION (Viewer Worker):**
- Authentication version tracking
- Thumbnail cache version
- General metadata caching

**VIDEO_CACHE (Video Streaming Worker):**
- HLS manifest caching
- Presigned URL caching
- Signing key caching
- 4-hour TTL for video content

## Data Flow

### Upload Flow

```
User → Album Worker → R2 (original)
                   → D1 (metadata + pending queue)
                   ↓
              GitHub Actions (hourly)
                   ↓
         Thumbnail Generation Script
                   ↓
              R2 (thumbnails)
                   ↓
              D1 (remove from pending queue)
```

### View Flow (Images)

```
User → Pages SPA → Viewer Worker → D1 (media list)
                                 → Sign URLs (if configured)
                                 → Return metadata + signed URLs
     ← Fetch thumbnails directly from R2 (presigned URLs)
     ← Fetch originals directly from R2 (presigned URLs)
```

### View Flow (Videos)

```
User → Pages SPA → Video Streaming Worker → R2 (HLS files)
                                          → Check manifest cache (KV)
                                          → Sign URLs (if cache miss)
                                          → Return signed manifest
     ← Fetch segments directly from R2 (presigned URLs)
     ← HLS.js handles adaptive bitrate selection
```

## Security

### Authentication

- Optional password protection via `GALLERY_PASSWORD` environment variable
- HMAC-based auth tokens stored in HttpOnly cookies
- Token versioning for instant invalidation
- Subdomain-compatible tokens

See [Token Revocation](../operations/token-revocation.md) for token management.

### Authorization

- Presigned URLs with 30-minute TTL for media access
- CORS restricted to Pages origin
- No public R2 access without signed URLs
- Input validation to prevent path traversal

### Break Glass Procedures

Emergency procedures for bypassing branch protection are documented in [Break Glass](../operations/breakglass.md).

## Performance Optimizations

### Media Delivery

- **Direct R2 Access:** Presigned URLs keep workers out of media delivery path
- **Edge Caching:** Cloudflare CDN caches R2 responses
- **Lazy Loading:** Frontend loads thumbnails on-demand
- **Responsive Images:** Multiple thumbnail sizes for different viewports

### Video Streaming

- **Adaptive Bitrate:** HLS provides multiple quality levels (360p, 720p, 1080p)
- **Manifest Caching:** 4-hour KV cache for HLS manifests
- **Batch Signing:** Optimized crypto operations for URL signing
- **Progressive Delivery:** First segments signed immediately for faster playback

See [HLS Implementation](hls-implementation.md) for video streaming details.

### Worker Performance

- **Worker Separation:** Isolates CPU-intensive video signing from I/O-intensive image serving
- **Parallel Operations:** Batch operations for signing and caching
- **KV Caching:** Reduces database queries and crypto operations

## Monitoring & Operations

### CI/CD Pipeline

GitHub Actions workflows handle:
- Automated testing on pull requests
- Deployment to production on merge to main
- Hourly thumbnail generation
- Daily video conversion (if needed)

### Operational Procedures

- [Upload Workflow](../operations/upload-workflow.md) - Adding new media
- [Token Revocation](../operations/token-revocation.md) - Security incidents
- [Break Glass](../operations/breakglass.md) - Emergency access

## Technology Decisions

### Why Cloudflare?

- **Global Edge Network:** Low latency worldwide
- **Integrated Platform:** Workers, Pages, R2, D1, KV work seamlessly
- **Generous Free Tier:** Cost-effective for personal projects
- **Zero Cold Starts:** Workers are always ready

### Why React + Vite?

- **Modern DX:** Fast development with HMR
- **Component Library:** shadcn/ui provides high-quality components
- **TypeScript:** Type safety for reliability
- **Performance:** Vite optimizes for production

### Why HLS for Video?

- **Adaptive Bitrate:** Quality adjusts to network conditions
- **Browser Support:** Wide compatibility via HLS.js
- **Streaming:** Users can start watching before full download
- **Multiple Qualities:** Serves different devices effectively

## Future Enhancements

Potential improvements documented in the [archive](../archive/) directory include:

- R2 public custom domain for zero-crypto URLs
- WebP/AVIF thumbnail support
- Client-side thumbnail generation
- Progressive web app (PWA) support
- Batch presigned URL refresh

## Related Documentation

- [Pages Migration Guide](pages-migration.md) - Detailed migration walkthrough
- [HLS Implementation](hls-implementation.md) - Video streaming deep dive
- [Workspace Setup](../development/workspace-setup.md) - Development environment
