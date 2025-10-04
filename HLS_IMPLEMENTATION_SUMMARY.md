# HLS Implementation Summary

## Overview
Added complete HLS (HTTP Live Streaming) adaptive bitrate video support to the wedding gallery application. This improves video playback performance, especially for mobile and cellular users.

## What Was Done

### 1. Video Thumbnail Generation
- **Created**: `scripts/lib/thumbnail-generator.mjs` - Shared DRY utility for thumbnail generation
- Extracts video frames using ffmpeg at 1 second mark
- Generates 3 thumbnail sizes (small/150px, medium/400px, large/800px) in WebP format
- Also handles image thumbnails with EXIF-aware rotation
- Supports EXIF metadata extraction for images

### 2. HLS Conversion System
- **Created**: `scripts/lib/hls-converter.mjs` - HLS conversion utility
- Converts videos to adaptive bitrate HLS with multiple quality levels:
  - 1080p (5000k bitrate)
  - 720p (2800k bitrate)
  - 480p (1400k bitrate)
  - 360p (800k bitrate)
- Automatically selects quality levels based on source video resolution
- Generates master playlist and variant playlists
- Creates 4-second segments for smooth streaming

### 3. Batch Conversion Script
- **Created**: `scripts/convert-videos-to-hls.mjs`
- Processes all videos in the database
- Checks for existing HLS conversions to avoid duplicates
- Supports dry-run mode (`--convert` flag required)
- Force reconversion with `--force` flag
- Uploads HLS files to R2 under `hls/{videoKey}/` prefix

### 4. Updated Thumbnail Scripts
- **Modified**: `scripts/generate-and-upload-thumbnails.mjs`
  - Now processes both images AND videos
  - Uses shared thumbnail utility (DRY)
  - Shows icons (🎬 for videos, 📸 for images)

- **Modified**: `scripts/generate-thumbnails-from-pending.mjs`
  - Processes videos from pending queue
  - Only extracts EXIF for images (not videos)
  - Uses shared thumbnail utility

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

### 6. Dependencies Added
- `fluent-ffmpeg` - Video processing
- `@ffmpeg-installer/ffmpeg` - FFmpeg binary
- `exifr` - EXIF metadata extraction
- HLS.js (CDN) - Client-side HLS playback

## Current Video Statistics
- **Total videos**: 3
- **Total size**: ~77 MB
- **Average size**: ~26 MB
- **Range**: 17 MB - 41 MB

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

## Next Steps (Not Yet Done)
- Run thumbnail generation for existing videos
- Run HLS conversion for existing videos
- Test playback on mobile devices
- Monitor R2 storage usage
- Consider implementing HLS conversion in album upload worker (for new uploads)

## Git Commit
Commit: 13969cd39848e56f939cc89be36d0788d6f9039f
Branch: release
Status: Committed (not pushed)
