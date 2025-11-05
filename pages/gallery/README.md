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

2. Copy environment file:
```bash
cp .env.example .env.development
```

3. Start the development server:
```bash
npm run dev
```

The app will be available at `http://localhost:5173`

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

- `VITE_API_BASE` - Your Worker API URL (e.g., `https://gallery.yourdomain.com`)

## Architecture

This frontend is designed to work with the Wedding Gallery Worker API:

- `/api/media` - Get media list with pre-signed URLs
- `/api/hls/playlist?key=<key>` - Get HLS playlist for videos
- `/login` - Authentication endpoint

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
