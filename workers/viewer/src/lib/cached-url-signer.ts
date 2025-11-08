/**
 * KV-cached URL signing for video content
 * Caches pre-signed URLs for 4 hours to avoid CPU thrashing
 */

import { signR2Url } from './r2-signer'

interface SigningConfig {
  accessKeyId: string
  secretAccessKey: string
  region: string
  bucket: string
  accountId: string
}

/**
 * Generate a pre-signed URL with KV caching
 * Uses a 4-hour cache window to minimize CPU-intensive signing operations
 *
 * @param kv - KV namespace for caching
 * @param config - R2 signing configuration
 * @param objectKey - R2 object key
 * @param expiresInSeconds - URL expiration time (default: 4 hours)
 * @returns Pre-signed URL (from cache or newly generated)
 */
export async function getCachedSignedUrl(
  kv: KVNamespace,
  config: SigningConfig,
  objectKey: string,
  expiresInSeconds: number = 14400 // 4 hours default
): Promise<string> {
  // Create cache key based on object key and time window
  // Time window ensures URLs are regenerated before they expire
  const timeWindow = Math.floor(Date.now() / 1000 / expiresInSeconds)
  const cacheKey = `signed:${objectKey}:${timeWindow}`

  // Try to get from cache first
  const cached = await kv.get(cacheKey)
  if (cached) {
    return cached
  }

  // Generate new signed URL
  const signedUrl = await signR2Url(config, objectKey, expiresInSeconds)

  // Cache with TTL slightly less than expiration to ensure validity
  // Use 90% of expiration time to provide safety margin
  const cacheTtl = Math.floor(expiresInSeconds * 0.9)
  await kv.put(cacheKey, signedUrl, { expirationTtl: cacheTtl })

  return signedUrl
}

/**
 * Helper to check if video signing should be enabled
 * Video signing is always enabled when R2 credentials are available
 */
export function isVideoSigningEnabled(env: any): boolean {
  return !!(
    env.R2_ACCESS_KEY_ID &&
    env.R2_SECRET_ACCESS_KEY &&
    env.R2_REGION &&
    env.R2_BUCKET_NAME &&
    env.R2_ACCOUNT_ID
  )
}
