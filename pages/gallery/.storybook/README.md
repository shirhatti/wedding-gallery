# Storybook Configuration

This directory contains the Storybook configuration for the Wedding Gallery UI components.

## Development

Run Storybook locally:
```bash
npm run storybook
```

This starts Storybook on http://localhost:6006

## Building

Build Storybook static files:
```bash
npm run build-storybook
```

This creates a static build in the `storybook-static/` directory.

## Deployment

Storybook is automatically deployed alongside the main gallery app to Cloudflare Pages. The build process:

1. Builds the main gallery app (`tsc && vite build`)
2. Builds Storybook (`storybook build`)
3. Copies Storybook to `dist/storybook/`

When deployed, Storybook is accessible at:
- **Production**: `https://yoursite.com/storybook`
- **Preview**: `https://preview.yoursite.com/storybook`

## Configuration

- **main.ts** - Storybook configuration, addons, and Vite settings
- **preview.ts** - Global decorators, parameters, and theming
