# Workspace Development Guide

This project uses npm workspaces to manage multiple packages in a monorepo structure.

## Project Structure

```
wedding-gallery/
├── workers/
│   ├── viewer/          (@wedding-gallery/viewer)
│   └── album/           (@wedding-gallery/album)
├── pages/
│   └── gallery/         (@wedding-gallery/pages)
├── tsconfig.base.json   (shared TypeScript config)
└── package.json         (root workspace config)
```

## Development Commands

### Start Development Servers

```bash
# Start viewer (API backend) + pages (frontend) - most common
# Uses remote bindings (production D1, R2, KV) with pre-signed URLs enabled
npm run dev

# Start all services (viewer, album, pages)
npm run dev:all

# Start individual services
npm run dev:viewer    # API backend on http://localhost:8787 (remote bindings)
npm run dev:album     # Album processor worker
npm run dev:pages     # Frontend on http://localhost:5173
```

**Note:** The viewer runs with `--remote` by default, connecting to production D1, R2, and KV. This is the recommended setup for local development. If you need local-only development, use `npm run dev:local -w workers/viewer`.

### Building

```bash
# Build pages app
npm run build
# or
npm run build:pages
```

### Deployment

```bash
# Deploy individual services
npm run deploy:viewer
npm run deploy:album
npm run deploy:pages

# Deploy everything
npm run deploy:all
```

## Working with Workspaces

### Installing Dependencies

```bash
# Install a dependency in a specific workspace
npm install <package> -w workers/viewer
npm install <package> -w pages/gallery

# Install a dev dependency at the root (shared across all workspaces)
npm install -D <package> --workspace-root

# Install all dependencies (run after pulling changes)
npm install
```

### Running Scripts in Workspaces

```bash
# Run a script in a specific workspace
npm run <script> -w workers/viewer
npm run <script> -w pages/gallery

# Example: build pages from root
npm run build -w pages/gallery
```

## TypeScript Configuration

All packages extend from `tsconfig.base.json` which contains shared compiler options:
- `workers/viewer/tsconfig.json` - extends base + Cloudflare Workers types
- `workers/album/tsconfig.json` - extends base + Cloudflare Workers types
- `pages/gallery/tsconfig.json` - extends base + React-specific config

## Package Naming Convention

Packages use scoped naming:
- `@wedding-gallery/viewer` - API backend worker
- `@wedding-gallery/album` - Album processor worker
- `@wedding-gallery/pages` - React frontend

## Environment Variables

### Viewer Worker

**Default dev script sets:**
- `ALLOW_LOCALHOST_CORS=true` (for local frontend)
- `ENABLE_PRESIGNED_URLS=true` (for direct R2 access)

**Optional (workers/viewer/.dev.vars):**
```bash
# Only needed for local (non-remote) development
R2_ACCESS_KEY_ID=your_key
R2_SECRET_ACCESS_KEY=your_secret
R2_REGION=auto
R2_BUCKET_NAME=wedding-photos
R2_ACCOUNT_ID=your_account_id

# Optional password protection
GALLERY_PASSWORD=your_password
AUTH_SECRET=your_secret_key
```

### Pages App (pages/gallery/.env.local)
```bash
VITE_API_BASE=http://localhost:8787
```

**Note:** With `--remote`, the viewer connects to production R2 credentials, so R2 signing works automatically without local .dev.vars configuration.

## Tips

- Dependencies are hoisted to the root `node_modules` when possible
- Workspace-specific dependencies stay in their own `node_modules`
- TypeScript and Wrangler are shared from the root
- Use `npm run dev` for most development work (starts viewer + pages)
- The `concurrently` tool runs multiple dev servers with colored output

## Troubleshooting

**Port conflicts**: If port 5173 is taken, kill the process:
```bash
lsof -ti:5173 | xargs kill
```

**CORS errors**: The default `npm run dev` command automatically sets `ALLOW_LOCALHOST_CORS=true`. If you still see CORS errors, verify the pages app is running on port 5173.

**Dependencies not found**: Run `npm install` at the root to ensure all workspaces are set up

**Remote bindings not working**: Ensure you're authenticated with Cloudflare (`wrangler login`) and have access to the production resources (D1, R2, KV)
