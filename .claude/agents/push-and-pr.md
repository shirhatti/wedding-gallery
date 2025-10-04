# Push to Main and Create PR to Release

Push the current branch to main and create a PR from main to release.

## Task

1. Push current HEAD to main:
   ```bash
   git push origin HEAD:main
   ```

2. Wait for tests to pass on main branch (required by branch protection)

3. Create a PR from main to release:
   ```bash
   gh pr create --base release --head main --title "Sync release with main" --body "Updates from main branch"
   ```

4. Report back the PR URL

## Notes

- Main branch is protected and requires tests to pass
- The push may be rejected if tests haven't completed yet
- PRs to release don't require approval (can't self-approve)
- Use CLI to merge: `git checkout release && git merge main --ff-only && git push`
