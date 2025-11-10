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

Storybook is automatically deployed to GitHub Pages via GitHub Actions. The deployment is triggered on pushes to `main` or `release` branches.

The GitHub Action (`.github/workflows/storybook.yml`):
1. Installs dependencies
2. Builds Storybook
3. Deploys to GitHub Pages using the Bitovi action

When deployed, Storybook is accessible at:
- **GitHub Pages**: `https://shirhatti.github.io/wedding-gallery/`

## Configuration

- **main.ts** - Storybook configuration, addons, and Vite settings
- **preview.ts** - Global decorators, parameters, and theming
