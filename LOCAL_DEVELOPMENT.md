# Local Development Guide

## Testing Pages App Against Production Data

You have three options for local development:

---

## Option 1: Pages → Production Worker (Recommended) ✅

**Best for:** Quick testing with real data without running Worker locally

### Setup

1. **Create `.env.local` in Pages app:**
```bash
cd pages/gallery
cat > .env.local <<EOF
VITE_API_BASE=https://your-worker.workers.dev
EOF
```

Replace `your-worker.workers.dev` with your actual Worker URL.

2. **Update Worker CORS to allow localhost:**

```bash
cd workers/viewer
wrangler secret put PAGES_ORIGIN
# Enter: http://localhost:5173
```

Or update your Worker code to allow localhost in development:

```typescript
// In workers/viewer/src/index.ts
const allowedOrigins = [
  env.PAGES_ORIGIN,
  'http://localhost:5173', // Local dev
  'http://127.0.0.1:5173'  // Alternative localhost
].filter(Boolean);

const origin = request.headers.get('Origin') || '';
const allowedOrigin = allowedOrigins.includes(origin) ? origin : env.PAGES_ORIGIN || '*';

const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Range, Cookie',
  'Access-Control-Allow-Credentials': 'true',
  'Accept-Ranges': 'bytes',
};
```

3. **Run Pages dev server:**
```bash
npm run dev:pages
```

4. **Open browser:**
```
http://localhost:5173
```

### ✅ Pros
- No need to run Worker locally
- Use real production data
- Fast iteration on UI
- Real R2 pre-signed URLs work

### ⚠️ Cons
- Need internet connection
- Changes to Worker require deployment
- Uses production Worker CPU time

---

## Option 2: Local Worker → Production Bindings (Full Stack)

**Best for:** Testing Worker changes with production data

### Setup

1. **Create `.env.local` for Pages:**
```bash
cd pages/gallery
cat > .env.local <<EOF
VITE_API_BASE=http://localhost:8787
EOF
```

2. **Run Worker locally with production bindings:**

The Worker automatically connects to production D1, R2, and KV when you run `wrangler dev`:

```bash
cd workers/viewer
wrangler dev --port 8787
```

Wrangler connects to:
- **D1 Database**: `wedding-photos-metadata` (production)
- **R2 Bucket**: `wedding-photos` (production)
- **KV Namespace**: Your cache version KV (production)

3. **Set up environment variables for Pages app (optional):**

If you want to test the new Pages app with pre-signed URLs locally:

```bash
# In workers/viewer directory, create .dev.vars file
cd workers/viewer
cat > .dev.vars <<EOF
# Enable pre-signed URLs (required for Pages app)
ENABLE_PRESIGNED_URLS=true

# R2 signing credentials
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_REGION=auto
R2_BUCKET_NAME=wedding-photos
R2_ACCOUNT_ID=your_cloudflare_account_id

# CORS origin for Pages app
PAGES_ORIGIN=http://localhost:5173
EOF
cd ../..
```

> **Note:** If you don't set `ENABLE_PRESIGNED_URLS=true`, the Worker will use proxy mode (legacy behavior). The Pages app will still work but will proxy all media through the Worker instead of direct R2 access.

**Get R2 credentials:**
```bash
# In Cloudflare dashboard:
# 1. Go to R2 → Manage R2 API Tokens
# 2. Create API Token with "Object Read & Write" permissions
# 3. Copy Access Key ID and Secret Access Key
```

4. **Run both services:**

Terminal 1:
```bash
npm run dev:viewer
# Worker runs on http://localhost:8787
```

Terminal 2:
```bash
npm run dev:pages
# Pages runs on http://localhost:5173
```

### ✅ Pros
- Full stack development
- Test Worker changes immediately
- Debug Worker code locally
- Pre-signed URLs work with credentials

### ⚠️ Cons
- More complex setup
- Need to manage two dev servers
- R2 credentials needed for signing

---

## Option 3: Local Worker → Local Data (Isolated)

**Best for:** Development without affecting production

### Setup

1. **Create local D1 database:**
```bash
cd workers/viewer
wrangler d1 create wedding-photos-local

# Copy the database_id and update wrangler.toml
```

2. **Update `wrangler.toml` for local development:**
```toml
# Add this section
[[d1_databases]]
binding = "DB"
database_name = "wedding-photos-local"
database_id = "your-local-database-id"
preview_database_id = "your-local-database-id" # Use local for dev
```

3. **Initialize local database schema:**
```bash
# Apply your schema to local database
wrangler d1 execute wedding-photos-local --file=schema.sql
```

4. **Use local R2 storage:**

Wrangler automatically uses local storage for R2 in dev mode:
```bash
wrangler dev
# Creates .wrangler/state/ folder for local R2
```

5. **Upload test images to local R2:**
```bash
# You'll need to manually upload test files
# Or modify your upload worker to upload to local storage
```

### ✅ Pros
- No risk to production data
- Fully isolated development
- Works offline

### ⚠️ Cons
- Need to set up local database
- No production data
- Manual test data creation

---

## Recommended Workflow

### For UI Development
→ **Use Option 1** (Pages → Production Worker)

Quick iteration, real data, no Worker management.

### For Full-Stack Features
→ **Use Option 2** (Local Worker → Production Bindings)

Test both UI and API changes together.

### For Risky Changes
→ **Use Option 3** (Local Worker → Local Data)

Safe experimentation without affecting production.

---

## Quick Start Commands

### Option 1 (Pages → Production)
```bash
cd pages/gallery
echo "VITE_API_BASE=https://your-worker.workers.dev" > .env.local
npm run dev
```

### Option 2 (Full Stack)
```bash
# Terminal 1
cd workers/viewer
wrangler dev --port 8787

# Terminal 2
cd pages/gallery
echo "VITE_API_BASE=http://localhost:8787" > .env.local
npm run dev
```

---

## Troubleshooting

### CORS Errors
```
Access to fetch at 'https://worker.dev/api/media' from origin 'http://localhost:5173'
has been blocked by CORS policy
```

**Solution:** Add `http://localhost:5173` to Worker's PAGES_ORIGIN or update CORS logic to allow localhost origins.

### Authentication Issues
```
Failed to load media (401 Unauthorized)
```

**Solution:** If your Worker requires password auth, visit the Worker URL first (`http://localhost:8787` or production URL), log in, then refresh Pages app. The auth cookie will be shared.

### Pre-signed URLs Not Working
```
Failed to load resource: net::ERR_CERT_AUTHORITY_INVALID
```

**Solution:** Make sure R2 credentials are set in Worker (`.dev.vars` for local, secrets for production).

### Images Not Loading
```
Image shows broken icon or "Failed to load media"
```

**Solutions:**
1. Check that Worker is running and accessible
2. Verify `VITE_API_BASE` is correct in `.env.local`
3. Check browser console for API errors
4. Verify CORS headers are allowing the origin

---

## Environment Variables Reference

### Pages App (`pages/gallery/.env.local`)
```bash
# Point to Worker API
VITE_API_BASE=http://localhost:8787              # Local Worker
# VITE_API_BASE=https://worker.workers.dev       # Production Worker
```

### Worker Local Dev (`workers/viewer/.dev.vars`)
```bash
# Enable pre-signed URLs (set to "true" to enable, default: OFF)
ENABLE_PRESIGNED_URLS=true

# R2 Signing (required when ENABLE_PRESIGNED_URLS=true)
R2_ACCESS_KEY_ID=your_key
R2_SECRET_ACCESS_KEY=your_secret
R2_REGION=auto
R2_BUCKET_NAME=wedding-photos
R2_ACCOUNT_ID=your_account_id

# CORS
PAGES_ORIGIN=http://localhost:5173

# Auth (if needed)
GALLERY_PASSWORD=your_password
AUTH_SECRET=your_secret_key
```

---

## Testing Checklist

Before committing changes, test:

- [ ] Gallery loads and displays thumbnails
- [ ] Click thumbnail opens lightbox with full image
- [ ] Video playback works (if applicable)
- [ ] Keyboard navigation in lightbox (desktop)
- [ ] Mobile responsive layout
- [ ] Authentication flow (if enabled)
- [ ] Error states display properly
- [ ] Loading states show spinners

---

## Production Deployment

When ready to deploy:

1. **Build Pages:**
```bash
cd pages/gallery
npm run build
```

2. **Deploy Pages:**
```bash
wrangler pages deploy dist --project-name=wedding-gallery-pages
```

3. **Update Pages environment variables:**
```bash
# Set production API URL
wrangler pages secret put VITE_API_BASE
# Enter: https://your-production-worker.workers.dev
```

4. **Deploy Worker (if changed):**
```bash
cd workers/viewer
wrangler deploy
```

5. **Update Worker CORS:**
```bash
wrangler secret put PAGES_ORIGIN
# Enter: https://your-pages-app.pages.dev
```

That's it! Your Pages app will now fetch from production Worker with proper CORS.
