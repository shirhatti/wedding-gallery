# Push to Main and Create PR to Release

This workflow pushes the current branch to main and creates a PR to sync release.

## Steps

1. Push current branch to main
```bash
git push origin HEAD:main
```

2. Create PR from main to release
```bash
gh pr create --base release --head main --title "Sync release with main" --body "Updates from main branch"
```

## Usage

Run this workflow when you've committed changes and want to:
- Push to main
- Automatically create a PR to release for deployment
