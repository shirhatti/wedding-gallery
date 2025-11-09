# Wedding Gallery

A serverless wedding photo and video sharing platform built on Cloudflare's edge infrastructure.

## Overview

This application provides a secure, scalable gallery for sharing wedding photos and videos with guests. Built entirely on Cloudflare's platform, it leverages:

- **Cloudflare Pages** - React-based gallery frontend
- **Cloudflare Workers** - API and video streaming backend
- **Cloudflare R2** - Media storage
- **Cloudflare D1** - Metadata database
- **Cloudflare KV** - Caching layer

## Features

- 📸 Responsive photo gallery with lazy loading
- 🎥 Adaptive HLS video streaming
- 🔒 Optional password protection
- 📱 Mobile-optimized interface
- ⚡ Edge-native performance
- 🎨 Modern UI with shadcn/ui components

## Quick Start

See the [Workspace Setup Guide](docs/development/workspace-setup.md) for local development instructions.

## Documentation

Full documentation is available in the [docs](docs/) directory:

- **[Architecture](docs/architecture/)** - System design and implementation details
- **[Operations](docs/operations/)** - Runbooks and operational procedures
- **[Development](docs/development/)** - Setup guides and development workflows

## Architecture

The application uses a three-tier architecture:

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

See [Architecture Overview](docs/architecture/overview.md) for details.

## Deployment

The application is automatically deployed via GitHub Actions on push to the main branch. See [CLAUDE.md](CLAUDE.md) for deployment guidelines.

## License

Private repository - All rights reserved.
