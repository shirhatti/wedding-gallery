# Token Revocation Runbook

This guide explains how to invalidate all existing authentication tokens issued by the viewer worker.

## Token Revocation Process

To invalidate all existing auth tokens, bump the `auth_version` value stored in the `CACHE_VERSION` KV namespace. Tokens embed this version and are rejected if it does not match the current value.

```bash
# Increment the auth_version to invalidate all tokens
npx wrangler kv key put auth_version "2" --binding=CACHE_VERSION
```

## When to use
- Security incident (suspected token compromise)
- After rotating `AUTH_SECRET`
- Administrative need to force re-authentication

## Notes
- Default version is "1" if not set
- Incrementing the version (e.g., "1" → "2") immediately invalidates all existing tokens
- Users must log in again with `GALLERY_PASSWORD`
- The version can be any string; conventionally use incrementing numbers

## Check current version
```bash
npx wrangler kv key get auth_version --binding=CACHE_VERSION
```

## Implementation reference
- `workers/viewer/src/index.ts` uses the `auth_version` value when issuing tokens and verifying them.
  - Issue: reads version when creating tokens
  - Verify: checks version equality during validation
