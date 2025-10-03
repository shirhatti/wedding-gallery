# Upload Workflow

## Uploading New Photos

Use the upload script to upload photos to R2 and automatically track them for thumbnail generation:

```bash
node scripts/upload-photos.mjs /path/to/photos
```

This script will:
1. Upload each image to R2
2. Extract and store EXIF metadata in D1
3. Add to `pending_thumbnails` queue for automatic thumbnail generation

## Automatic Thumbnail Generation

Thumbnails are generated automatically every hour via GitHub Actions. The workflow:
1. Queries `pending_thumbnails` table in D1
2. Generates thumbnails for pending images
3. Uploads thumbnails to R2
4. Removes processed items from pending queue

You can also manually trigger thumbnail generation from the GitHub Actions UI.

## Manual Thumbnail Generation

To manually generate thumbnails for pending items:

```bash
node scripts/generate-thumbnails-from-pending.mjs
```

## Old Workflow (Deprecated)

The old process-photos.mjs script that scans the entire R2 bucket is now deprecated.
Use the upload script instead to avoid inefficient full bucket scans.
