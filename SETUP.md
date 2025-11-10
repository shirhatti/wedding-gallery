# Gallery Setup Guide

This guide will walk you through setting up your own photo and video gallery using this template.

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Node.js](https://nodejs.org/) v20 or higher
- [Git](https://git-scm.com/)
- Basic familiarity with command line

## Table of Contents

1. [Initial Setup](#1-initial-setup)
2. [Cloudflare Resources](#2-cloudflare-resources)
3. [Configuration](#3-configuration)
4. [Database Setup](#4-database-setup)
5. [GitHub Actions Setup](#5-github-actions-setup)
6. [Customization](#6-customization)
7. [First Deployment](#7-first-deployment)
8. [Uploading Photos](#8-uploading-photos)
9. [Troubleshooting](#troubleshooting)

## 1. Initial Setup

### Clone and Install

```bash
# Clone or download this repository
git clone <your-repo-url>
cd wedding-gallery

# Install dependencies
npm install

# Install Wrangler CLI globally (if not already installed)
npm install -g wrangler

# Login to Cloudflare
wrangler login
```

## 2. Cloudflare Resources

You'll need to create several Cloudflare resources. Run these commands in order:

### Create D1 Database

```bash
# Create the database
wrangler d1 create gallery-metadata

# Note the database ID from the output - you'll need this later
```

### Create KV Namespace

```bash
# Create production KV namespace
wrangler kv namespace create CACHE_VERSION

# Create preview KV namespace
wrangler kv namespace create CACHE_VERSION --preview

# Note both IDs from the output
```

### Create R2 Bucket

```bash
# Create R2 bucket for photos and videos
wrangler r2 bucket create gallery-photos

# Note the bucket name
```

### Create R2 API Tokens (Optional but Recommended)

For better performance with pre-signed URLs:

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → R2
2. Click "Manage R2 API Tokens"
3. Create new API token with "Object Read & Write" permissions
4. Save the Access Key ID and Secret Access Key

### Create Cloudflare Pages Project

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → Pages
2. Create a new project (you can connect it to your Git repo or deploy manually)
3. Note the project name

## 3. Configuration

### Update wrangler.toml Files

Update the following files with your resource IDs:

#### `workers/viewer/wrangler.toml`

```toml
[[r2_buckets]]
binding = "R2_BUCKET"
bucket_name = "gallery-photos"  # Your bucket name
preview_bucket_name = "gallery-photos"

[[d1_databases]]
binding = "DB"
database_name = "gallery-metadata"  # Your database name
database_id = "YOUR_D1_DATABASE_ID"  # From step 2

[[kv_namespaces]]
binding = "CACHE_VERSION"
id = "YOUR_KV_NAMESPACE_ID"  # From step 2
preview_id = "YOUR_KV_PREVIEW_NAMESPACE_ID"  # From step 2
```

#### `workers/video-streaming/wrangler.toml`

Use the same values as above.

#### `workers/album/wrangler.toml`

Use the same values as above (note: album worker doesn't use KV).

### Environment Variables

Copy the template and fill in your values:

```bash
cp .env.template .env
```

Edit `.env` and fill in:
- `CLOUDFLARE_ACCOUNT_ID` - From Cloudflare Dashboard
- Gallery password and auth secret (if you want password protection)
- Resource IDs from step 2
- R2 credentials (if using pre-signed URLs)

**Important:** Never commit `.env` to version control!

## 4. Database Setup

Initialize the D1 database schema:

```bash
# Apply migrations
wrangler d1 execute gallery-metadata --file=workers/viewer/schema.sql
```

If you don't have a schema.sql file, create the tables manually:

```sql
CREATE TABLE IF NOT EXISTS media (
  key TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL,
  date_taken TEXT,
  camera_make TEXT,
  camera_model TEXT,
  width INTEGER,
  height INTEGER
);

CREATE TABLE IF NOT EXISTS pending_thumbnails (
  key TEXT PRIMARY KEY,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_media_date ON media(date_taken);
CREATE INDEX idx_media_uploaded ON media(uploaded_at);
```

## 5. GitHub Actions Setup

### Required Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add these **Repository Secrets**:
- `CLOUDFLARE_API_TOKEN` - Your Cloudflare API token
- `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare account ID

### Required Variables

Add these **Repository Variables**:
- `CLOUDFLARE_PAGES_PROJECT_NAME` - Your Pages project name

### Worker Environment Variables

Set environment variables for your workers:

```bash
# For viewer worker
wrangler secret put GALLERY_PASSWORD --name viewer
wrangler secret put AUTH_SECRET --name viewer
wrangler secret put ALLOWED_DOMAIN --name viewer

# For video-streaming worker
wrangler secret put GALLERY_PASSWORD --name video-streaming
wrangler secret put AUTH_SECRET --name video-streaming
wrangler secret put ALLOWED_DOMAIN --name video-streaming

# For album worker (if using uploads)
wrangler secret put GALLERY_PASSWORD --name album
```

Generate a strong auth secret:
```bash
openssl rand -base64 32
```

### Pages Environment Variables

Set environment variables for your Pages project:

1. Go to Cloudflare Dashboard → Pages → Your Project → Settings → Environment variables
2. Add for both Production and Preview:
   - `GALLERY_PASSWORD` - Your gallery password
   - `AUTH_SECRET` - Same secret as workers
   - `ALLOWED_DOMAIN` - Your pages.dev domain (e.g., "yoursite.pages.dev")

## 6. Customization

### Branding

Replace these files with your own:
- `pages/gallery/public/logo.svg` - Your logo
- `pages/gallery/public/vite.svg` - Favicon

Update these files:
- `pages/gallery/index.html` - Title and meta tags
- `workers/album/src/index.html` - Upload page branding
- `pages/gallery/src/components/Login.tsx` - Login page

### Theme Colors

Edit `workers/album/src/index.html`:
- Search for `#26473e` and replace with your brand color
- Update gradient colors in the CSS

## 7. First Deployment

### Option A: Automatic (via GitHub Actions)

1. Push to `main` branch for preview deployment
2. Push to `release` branch for production deployment

The GitHub Actions workflow will automatically deploy everything.

### Option B: Manual Deployment

```bash
# Deploy workers
cd workers/viewer && npx wrangler deploy
cd ../video-streaming && npx wrangler deploy
cd ../album && npx wrangler deploy

# Build and deploy Pages
cd ../../pages/gallery
npm run build
npx wrangler pages deploy dist --project-name=YOUR_PROJECT_NAME
```

## 8. Uploading Photos

### Using the Upload Script

```bash
# Upload photos from a directory
node scripts/upload-photos.mjs /path/to/photos
```

The script will:
- Upload all images and videos to R2
- Extract EXIF metadata
- Add entries to the D1 database
- Queue thumbnail generation

### Manual Upload

You can also use the web upload interface (album worker) if enabled.

### Thumbnail Generation

Thumbnails are generated automatically via GitHub Actions (hourly) or manually:

```bash
node scripts/generate-thumbnails-from-pending.mjs
```

### Video Conversion

Videos are converted to HLS format via GitHub Actions (daily) or manually:

```bash
node scripts/convert-videos-to-hls.mjs --convert
```

## 9. Testing

Visit your gallery:
- Production: `https://yourproject.pages.dev`
- Preview: `https://preview.yourproject.pages.dev`

If password protection is enabled, you'll be prompted to enter the password.

## Troubleshooting

### "AUTH_SECRET must be configured" Error

Make sure you've set the `AUTH_SECRET` environment variable for all workers and Pages.

### Images Not Loading

1. Check that images are in the R2 bucket
2. Check that database has entries: `wrangler d1 execute gallery-metadata --command "SELECT COUNT(*) FROM media"`
3. Check worker logs: `wrangler tail viewer`

### Thumbnails Not Generating

1. Check pending queue: `wrangler d1 execute gallery-metadata --command "SELECT * FROM pending_thumbnails LIMIT 10"`
2. Run manually: `node scripts/generate-thumbnails-from-pending.mjs`
3. Check GitHub Actions logs

### Videos Not Playing

1. Ensure videos are converted to HLS: `node scripts/convert-videos-to-hls.mjs --list`
2. Check for `hls/` folder in R2 bucket
3. Run conversion manually: `node scripts/convert-videos-to-hls.mjs --convert`

### Cross-Domain Auth Issues

Make sure `ALLOWED_DOMAIN` is set to your Pages domain (e.g., "yoursite.pages.dev") in all workers and Pages environment variables.

## Cost Estimates

### Cloudflare Free Tier Includes:
- Pages: Unlimited requests, 500 builds/month
- Workers: 100,000 requests/day
- R2: 10 GB storage, 10 million Class A operations/month
- D1: 5 GB storage, 5 million reads/day
- KV: 1 GB storage, 100,000 reads/day

For a typical gallery with 1,000 photos and moderate traffic, you should stay within the free tier.

## Security Best Practices

1. **Never commit secrets** - Use `.gitignore` for `.env`
2. **Use strong passwords** - Generate with `openssl rand -base64 32`
3. **Rotate secrets regularly** - Update `AUTH_SECRET` periodically
4. **Monitor access** - Check Cloudflare Analytics
5. **Enable MFA** - On your Cloudflare account

## Next Steps

- Set up custom domain (Cloudflare Pages → Custom domains)
- Configure branch protection rules
- Set up monitoring and alerts
- Customize UI/UX to match your brand
- Add analytics (Cloudflare Web Analytics)

## Getting Help

- Check the [documentation](docs/)
- Review [GitHub Issues](issues/)
- See [Architecture Overview](docs/architecture/overview.md)

## License

See [LICENSE](LICENSE) file for details.
