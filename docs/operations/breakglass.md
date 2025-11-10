# Break Glass Procedure

This document describes how to bypass branch protection rules in emergency situations.

## Why Branch Protection Exists

- **main**: Requires tests to pass, linear history (fast-forward only)
- **release**: Requires tests to pass, linear history (fast-forward only)
- **Both**: Enforced on admins to prevent accidental direct pushes

**Note:** Neither branch requires PR reviews (single developer workflow), but both require status checks to pass.

## When to Break Glass

Only use this procedure when:
- CI/CD is down and you need to deploy a critical fix
- Settings app is misconfigured and blocking legitimate work
- Emergency rollback needed

**DO NOT** use this to bypass code review or testing in normal circumstances.

## Break Glass Steps

### 1. Temporarily Disable Protection

Choose the branch you need to modify (`main` or `release`):

```bash
# For release branch
gh api -X DELETE repos/shirhatti/wedding-gallery/branches/release/protection

# For main branch
gh api -X DELETE repos/shirhatti/wedding-gallery/branches/main/protection
```

### 2. Make Your Emergency Changes

```bash
git checkout <branch>
# Make your changes
git add .
git commit -m "BREAKGLASS: <reason for bypass>"
git push
```

**IMPORTANT**: Always prefix commit message with `BREAKGLASS:` so it's clear this bypassed normal process.

### 3. Re-enable Protection

Probot Settings will automatically re-apply protection rules on the next push to `.github/settings.yml`, but you can trigger it immediately:

```bash
# Trigger Probot to re-apply settings
git checkout main
git commit --allow-empty -m "Re-enable branch protection"
git push
```

Or wait ~1 minute and Probot will re-sync automatically.

### 4. Verify Protection is Re-enabled

```bash
# Check release branch
gh api repos/shirhatti/wedding-gallery/branches/release/protection | jq '.required_pull_request_reviews'

# Check main branch
gh api repos/shirhatti/wedding-gallery/branches/main/protection | jq '.required_status_checks'
```

Should return protection details, not `null`.

## Alternative: Use Web UI

1. Go to https://github.com/shirhatti/wedding-gallery/settings/branches
2. Click "Delete" on the protection rule
3. Make your changes and push
4. Protection will auto-restore from `.github/settings.yml`

## Post-Break Glass

After using break glass:
1. Document what happened and why it was necessary
2. If possible, create a follow-up PR to properly fix the issue
3. Consider if the process needs improvement to avoid future break glass scenarios
