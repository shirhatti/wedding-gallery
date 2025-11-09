---
layout: default
title: Home
---

# Wedding Gallery

A serverless wedding photo and video sharing platform built on Cloudflare's edge infrastructure.

## Overview

This application provides a secure, scalable gallery for sharing wedding photos and videos with guests. Built entirely on Cloudflare's platform, it leverages edge computing for global performance and reliability.

## Key Features

- 📸 **Responsive Photo Gallery** - Mobile-optimized grid layout with lazy loading
- 🎥 **Adaptive Video Streaming** - HLS with automatic quality selection
- 🔒 **Secure Access** - Optional password protection with token-based auth
- ⚡ **Edge Performance** - Global CDN delivery with minimal latency
- 🎨 **Modern UI** - Built with React and shadcn/ui components

## Architecture

```
┌──────────────────┐
│ Cloudflare Pages │  (React SPA)
└────────┬─────────┘
         │
    ┌────┴────┬─────────────────┐
    │         │                 │
┌───▼────┐ ┌──▼──────────┐ ┌───▼────┐
│ Viewer │ │ Video Stream│ │ Album  │  (Workers)
│ Worker │ │   Worker    │ │ Worker │
└───┬────┘ └──┬──────────┘ └───┬────┘
    │         │                 │
    └────┬────┴─────────────┬───┘
         │                  │
    ┌────▼────┐        ┌────▼────┐
    │ R2      │        │ D1 + KV │  (Storage)
    │ Storage │        │ Database│
    └─────────┘        └─────────┘
```

## Documentation

Comprehensive documentation is available in organized sections:

### [Architecture](architecture/)
Technical documentation on system design and implementation:
- [Architecture Overview](architecture/overview.md)
- [Pages Migration Guide](architecture/pages-migration.md)
- [HLS Video Implementation](architecture/hls-implementation.md)

### [Operations](operations/)
Runbooks and operational procedures:
- [Token Revocation](operations/token-revocation.md)
- [Break Glass Procedures](operations/breakglass.md)
- [Upload Workflow](operations/upload-workflow.md)

### [Development](development/)
Setup guides and development workflows:
- [Workspace Setup](development/workspace-setup.md)
- [Frontend Development](development/frontend-setup.md)

## Technology Stack

**Frontend:**
- React 18 + TypeScript
- Vite build tool
- Tailwind CSS
- shadcn/ui components
- HLS.js for video

**Backend:**
- Cloudflare Workers (API & video streaming)
- Cloudflare Pages (static hosting)
- Cloudflare R2 (object storage)
- Cloudflare D1 (SQL database)
- Cloudflare KV (caching)

## Getting Started

For local development:

1. Clone the repository
2. Install dependencies: `npm install`
3. Start development servers: `npm run dev`

See the [Workspace Setup Guide](development/workspace-setup.md) for detailed instructions.

## Additional Resources

- [GitHub Repository](https://github.com/shirhatti/wedding-gallery)
- [DeepWiki Documentation](https://deepwiki.com/shirhatti/wedding-gallery)
- [Full Documentation Index](README.html)

## License

Private repository - All rights reserved.
