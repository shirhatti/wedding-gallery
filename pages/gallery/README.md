# Wedding Gallery - Cloudflare Pages Frontend

Modern React frontend for the wedding gallery, built with Vite, React, TypeScript, and shadcn/ui.

## Features

- 🎨 Built with shadcn/ui components and Tailwind CSS
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

**Note:** For local development, set the API base URLs:
```bash
VITE_API_BASE=http://localhost:8787 VITE_VIDEO_API_BASE=http://localhost:8788 npm run dev
```

This points the app to:
- `VITE_API_BASE`: Viewer worker at `http://localhost:8787`
- `VITE_VIDEO_API_BASE`: Video streaming worker at `http://localhost:8788`

### Developing with Local Worker

1. In a separate terminal, start the Worker:
```bash
cd ../../workers/viewer
npm run dev
```

2. The Worker will run on `http://localhost:8787`
3. The Pages app is configured to proxy to this endpoint in development

## Building

```bash
npm run build
```

The output will be in the `dist` directory.

## Deployment

### Using Wrangler

```bash
npm run pages:deploy
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
- **Tailwind CSS** - Utility-first CSS
- **shadcn/ui** - High-quality React components
- **HLS.js** - Video streaming
- **Lucide React** - Icons
