# Wedding Gallery - Cloudflare Pages Frontend

Modern React frontend for the wedding gallery, built with Vite, React, TypeScript, and Tailwind CSS.

## Features

- 🎨 Built with custom components using shadcn/ui styling patterns and Tailwind CSS
- ⚡ Fast development with Vite
- 📱 Responsive design (mobile and desktop)
- 🖼️ Lightbox with keyboard navigation
- 🎥 HLS video playback support
- 🔒 Cookie-based authentication

## Development

### Prerequisites

- Node.js 18+
- npm or pnpm

### Setup

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

**Note:** The Vite config includes proxy settings that automatically route API requests to `localhost:8787` (viewer) and `localhost:8788` (video-streaming) during local development. Environment variables are only required for production deployments or if you need to override the default proxy behavior.

Optionally create `pages/gallery/.env.local`:
```bash
VITE_API_BASE=http://localhost:8787
VITE_VIDEO_API_BASE=http://localhost:8788
```

### Developing with Local Workers

**Recommended:** Use the monorepo dev commands from the project root:
```bash
# From project root - starts viewer + video-streaming + pages
npm run dev
```

**Alternative:** Run services individually in separate terminals:
```bash
# Terminal 1: Viewer worker
npm run dev:viewer    # http://localhost:8787

# Terminal 2: Video streaming worker
npm run dev:video     # http://localhost:8788

# Terminal 3: Frontend
npm run dev:pages     # http://localhost:5173
```

The Pages app proxy configuration automatically routes requests to the local workers.

## Building

```bash
npm run build
```

The output will be in the `dist` directory.

## Deployment

### Using Wrangler

```bash
npm run deploy:pages
```

### Environment Variables

Set these in the Cloudflare Pages dashboard or via CLI:

- `VITE_API_BASE` - Viewer Worker API URL (e.g., `https://viewer.yourdomain.workers.dev`)
- `VITE_VIDEO_API_BASE` - Video Streaming Worker URL (e.g., `https://video-streaming.yourdomain.workers.dev`)

## Architecture

This frontend is designed to work with two Worker APIs:

**Viewer Worker** (`VITE_API_BASE`):
- `/api/media` - Get media list with metadata
- `/api/file/:key` - Get media files (fallback when presigned URLs unavailable)
- `/api/thumbnail/:key` - Get thumbnails
- `/login` - Authentication endpoint

**Video Streaming Worker** (`VITE_VIDEO_API_BASE`):
- `/api/hls/playlist?key=<key>` - Get HLS master playlist for videos
- `/api/hls/:key/:variant` - Get variant playlists (360p, 720p, 1080p)
- `/api/hls-segment/:key/:segment` - Get video segments with presigned URLs

### Pre-signed URLs

When the Worker is configured with R2 credentials, media is fetched directly from R2 using pre-signed URLs, keeping the Worker out of the media delivery path.

## Tech Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Utility-first CSS with shadcn/ui patterns
- **HLS.js** - Video streaming
- **Lucide React** - Icons
