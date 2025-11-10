# Token Revocation Runbook

This guide explains how to invalidate all existing authentication tokens issued by the viewer worker.

## Primary Method: Rotate AUTH_SECRET

The simplest way to invalidate all existing auth tokens is to update the `AUTH_SECRET` environment variable. Since tokens are signed using HMAC-SHA256 with this secret, changing it immediately invalidates all existing tokens.

```bash
# Update AUTH_SECRET in your Cloudflare Pages project
# This can be done via the Cloudflare dashboard under Settings > Environment variables
# Or via wrangler:
npx wrangler pages secret put AUTH_SECRET
```

After rotation, users must log in again with `GALLERY_PASSWORD`.

## Alternative Method: Bump auth_version

You can also invalidate tokens by bumping the `auth_version` value in the `CACHE_VERSION` KV namespace. Tokens embed this version and are rejected if it does not match the current value. This method is useful if you want to revoke tokens without changing the `AUTH_SECRET`.

```bash
# Increment the auth_version to invalidate all tokens
npx wrangler kv key put auth_version "2" --binding=CACHE_VERSION
```

## When to use
- Security incident (suspected token compromise) - rotate `AUTH_SECRET`
- Administrative need to force re-authentication - use either method
- Granular revocation without changing secrets - bump `auth_version`

## Notes
- Rotating `AUTH_SECRET` is the preferred method for security incidents
- The `auth_version` default is "1" if not set
- Incrementing the version (e.g., "1" → "2") immediately invalidates all existing tokens
- The version can be any string; conventionally use incrementing numbers

## Check current auth_version
```bash
npx wrangler kv key get auth_version --binding=CACHE_VERSION
```

## Implementation reference
- `packages/auth/src/index.ts` contains the token creation and validation logic
  - Tokens are HMAC-signed with `AUTH_SECRET` (changing it invalidates all tokens)
  - Tokens embed `auth_version` from KV (bumping it also invalidates tokens)
