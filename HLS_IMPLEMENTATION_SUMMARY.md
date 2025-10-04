# HLS Implementation Summary

## Overview
Added complete HLS (HTTP Live Streaming) adaptive bitrate video support to the wedding gallery application. This improves video playback performance, especially for mobile and cellular users. Videos now have proper aspect ratio preservation, metadata extraction, and automated CI/CD workflows.

## What Was Done

### 1. Video Thumbnail Generation
- **Created**: `scripts/lib/thumbnail-generator.mjs` - Shared DRY utility for thumbnail generation
- Extracts video frames using ffmpeg at 1 second mark **with aspect ratio preservation** (`1920x?`)
- Generates 3 thumbnail sizes (small/150px, medium/400px, large/800px) in WebP format
- Also handles image thumbnails with EXIF-aware rotation
- Supports EXIF metadata extraction for images
- **Video metadata extraction**: Uses ffprobe to extract creation time from QuickTime/MP4 metadata
- **HEIC support**: Converts HEIC images to JPEG before processing

### 2. HLS Conversion System
- **Created**: `scripts/lib/hls-converter.mjs` - HLS conversion utility
- Converts videos to adaptive bitrate HLS with multiple quality levels:
  - 1080p (5000k bitrate)
  - 720p (2800k bitrate)
  - 480p (1400k bitrate)
  - 360p (800k bitrate)
- **Aspect ratio preservation**: Uses scale filter (`scale=-2:height`) instead of forcing exact dimensions
- **10-bit to 8-bit conversion**: Converts 10-bit HEVC (iPhone videos) to 8-bit H.264 for maximum browser compatibility
- Automatically selects quality levels based on source video resolution
- Creates custom presets for low-resolution videos (below 360p)
- Generates master playlist with accurate output resolutions
- Creates 4-second segments for smooth streaming
- Uses H.264 main profile for universal compatibility

### 3. Batch Conversion Script
- **Created**: `scripts/convert-videos-to-hls.mjs`
- Processes all videos in the database
- Queries D1 directly (not local SQLite) to get video list
- Checks for existing HLS conversions to avoid duplicates
- Supports dry-run mode (`--convert` flag required)
- Force reconversion with `--force` flag
- **Optimized upload**: Uses wrangler CLI directly instead of worker API to avoid CPU time limits
- Uploads HLS files to R2 under `hls/{videoKey}/` prefix

### 4. Updated Thumbnail Scripts
- **Modified**: `scripts/generate-and-upload-thumbnails.mjs`
  - Now processes both images AND videos
  - Uses shared thumbnail utility (DRY)
  - Shows icons (🎬 for videos, 📸 for images)

- **Modified**: `scripts/generate-thumbnails-from-pending.mjs`
  - Processes videos from pending queue
  - Extracts EXIF for images AND video metadata (creation time) for videos
  - **Atomic database updates**: Batches all SQL updates into single transaction at end
  - Uses shared thumbnail utility

- **Created**: `scripts/regenerate-video-thumbnails.mjs`
  - Helper script to delete and regenerate video thumbnails
  - Useful for fixing aspect ratio issues from old thumbnails

### 5. Viewer Updates
- **Modified**: `workers/viewer/src/index.ts`
  - Added `/api/hls/{videoKey}/{filename}` endpoint
  - Serves HLS manifests (.m3u8) and segments (.ts)
  - Proper content types and caching headers

- **Modified**: `workers/viewer/src/templates/gallery.ts`
  - Grid view now shows video thumbnails (not full videos) for better performance
  - Integrated HLS.js library for adaptive streaming
  - Detects HLS availability and falls back to MP4 if needed
  - Native HLS support for Safari
  - Proper cleanup of HLS instances on navigation/close
  - Play button overlay on video thumbnails

### 6. CI/CD Workflows
- **Created**: `.github/workflows/convert-videos.yml`
  - Runs daily at 2 AM UTC
  - Converts new videos to HLS automatically
  - 60-minute timeout for processing
  - Manual trigger via workflow_dispatch

- **Existing**: `.github/workflows/generate-thumbnails.yml`
  - Runs hourly
  - Processes pending thumbnail queue
  - Now handles both images and videos

### 7. Dependencies Added
- `fluent-ffmpeg` - Video processing
- `@ffmpeg-installer/ffmpeg` - FFmpeg binary bundled with package
- `@ffprobe-installer/ffprobe` - FFprobe binary for metadata extraction
- `exifr` - EXIF metadata extraction for images
- `heic-convert` - HEIC to JPEG conversion
- HLS.js (CDN) - Client-side HLS playback

## Current Video Statistics
- **Total videos**: 4
- **HLS conversions**: 3 (1 pending)
- **Video thumbnails**: Need regeneration with correct aspect ratio

## How to Use

### Generate Thumbnails for Videos
```bash
cd /Users/shirhatti/dev/wedding-gallery
node scripts/generate-and-upload-thumbnails.mjs          # Dry run
node scripts/generate-and-upload-thumbnails.mjs --generate  # Actually generate
```

### Convert Videos to HLS
```bash
cd /Users/shirhatti/dev/wedding-gallery
node scripts/convert-videos-to-hls.mjs          # Dry run
node scripts/convert-videos-to-hls.mjs --convert   # Actually convert
```

### Process Pending Thumbnails (for web uploads)
```bash
cd /Users/shirhatti/dev/wedding-gallery
node scripts/generate-thumbnails-from-pending.mjs
```

### Regenerate Video Thumbnails (fix aspect ratio)
```bash
cd /Users/shirhatti/dev/wedding-gallery
node scripts/regenerate-video-thumbnails.mjs
node scripts/generate-thumbnails-from-pending.mjs
```

## R2 Storage Structure
```
wedding-photos/
├── {original-videos}.mov              # Original video files
├── thumbnails/
│   ├── small/{key}                    # 150px thumbnails
│   ├── medium/{key}                   # 400px thumbnails
│   └── large/{key}                    # 800px thumbnails
└── hls/
    └── {videoKey}/
        ├── master.m3u8                # Master playlist
        ├── 1080p.m3u8                 # 1080p variant playlist
        ├── 1080p_000.ts               # 1080p segments
        ├── 720p.m3u8                  # 720p variant playlist
        ├── 720p_000.ts                # 720p segments
        └── ...                        # Other quality levels
```

## Viewer Behavior
1. **Grid View**: Shows video thumbnails (extracted frame) with play button overlay
2. **Lightbox Click**: Checks for HLS version first
3. **HLS Available**: Uses HLS.js for adaptive streaming (or native Safari HLS)
4. **HLS Not Available**: Falls back to direct MP4 playback
5. **Automatic Quality**: HLS.js selects best quality based on bandwidth

## Known Issues & Fixes
- ✅ **Fixed**: Aspect ratio distortion - Videos now use scale filter to preserve aspect ratio
- ✅ **Fixed**: 10-bit HEVC conversion errors - Now converts to 8-bit H.264 with `-pix_fmt yuv420p`
- ✅ **Fixed**: Worker CPU timeouts during upload - Now uses wrangler CLI for R2 uploads
- ✅ **Fixed**: Missing ffprobe - Added `@ffprobe-installer/ffprobe` package
- ✅ **Fixed**: Inefficient database updates - Now batches all updates atomically
- ✅ **Fixed**: Missing video timestamps - Now extracts creation_time from video metadata
