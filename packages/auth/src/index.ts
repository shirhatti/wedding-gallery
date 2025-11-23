/**
 * Shared authentication utilities for wedding gallery
 * Handles token creation, validation, and cookie management
 */

import { parse as parseCookies } from 'cookie'

export interface AuthConfig {
  secret: string
  cacheVersion: {
    get(key: string): Promise<string | null>
  }
  /** Set to true to disable auth checks entirely (for local development) */
  disableAuth?: boolean
  /** The allowed domain for cross-subdomain authentication (e.g., "example.pages.dev") */
  allowedDomain?: string
}

/**
 * Creates an HMAC-signed authentication token
 * @param config Auth configuration with secret and cache version
 * @param audience The audience/origin for the token
 * @returns Promise<string> The signed token
 */
export async function createAuthToken(config: AuthConfig, audience: string): Promise<string> {
  const secret = config.secret
  if (!secret) {
    throw new Error("AUTH_SECRET must be configured")
  }
  const issuedAt = Math.floor(Date.now() / 1000)
  const version = (await config.cacheVersion.get("auth_version")) || "1"
  // Use '|' inside payload to avoid conflicts with '.' separator
  const payload = `${audience}|${version}|${issuedAt}`
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))
  const b64 = arrayBufferToBase64(sig)
  return `${payload}.${b64}`
}

/**
 * Validates an authentication token
 * @param config Auth configuration with secret and cache version
 * @param audience The expected audience/origin
 * @param token The token to validate
 * @returns Promise<boolean> True if valid, false otherwise
 */
export async function validateAuthToken(config: AuthConfig, audience: string, token: string): Promise<boolean> {
  // Feature flag: bypass auth entirely if disabled (for local development)
  if (config.disableAuth) {
    return true
  }

  const lastDot = token.lastIndexOf(".")
  if (lastDot <= 0) return false
  const payload = token.slice(0, lastDot)
  const sig = token.slice(lastDot + 1)

  const [tokenAudience, tokenVersion, issuedAtStr] = payload.split("|")
  if (!tokenAudience || !tokenVersion || !issuedAtStr) return false
  // Allow tokens across subdomains of the same root domain
  if (!audiencesMatch(tokenAudience, audience, config.allowedDomain)) return false

  const currentVersion = (await config.cacheVersion.get("auth_version")) || "1"
  if (!timingSafeEqual(tokenVersion, currentVersion)) return false
  const issuedAt = Number(issuedAtStr)
  if (!Number.isFinite(issuedAt)) return false
  // Optional: expire after 30 days
  const now = Math.floor(Date.now() / 1000)
  if (now - issuedAt > 60 * 60 * 24 * 30) return false

  const secret = config.secret
  if (!secret) return false
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const expected = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))
  const expectedB64 = arrayBufferToBase64(expected)
  return timingSafeEqual(sig, expectedB64)
}

/**
 * Extracts the authentication cookie from a request
 * @param request The incoming request
 * @param cookieName The name of the cookie (defaults to "gallery_auth")
 * @returns string The cookie value, or empty string if not found
 */
export function getAuthCookie(request: Request, cookieName = "gallery_auth"): string {
  const cookieHeader = request.headers.get("Cookie") || ""
  const cookies = parseCookies(cookieHeader)
  return cookies[cookieName] || ""
}

/**
 * Validates a returnTo URL for open redirect prevention
 * @param returnTo The URL to validate
 * @param allowedDomain The allowed domain pattern (e.g., "example.pages.dev")
 * @returns boolean True if the URL is safe to redirect to
 */
export function isValidReturnTo(returnTo: string, allowedDomain: string): boolean {
  // Allow relative paths (must start with / and not start with //)
  if (returnTo.startsWith("/") && !returnTo.startsWith("//")) {
    return true
  }

  // Allow absolute URLs to allowed domain (including subdomains)
  try {
    const url = new URL(returnTo)
    return url.protocol === "https:" &&
           (url.hostname === allowedDomain ||
            url.hostname.endsWith(`.${allowedDomain}`))
  } catch {
    return false
  }
}

/**
 * Converts ArrayBuffer to base64 string
 * @param buffer The buffer to convert
 * @returns string Base64-encoded string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunkSize = 0x8000 // avoid call stack limits
  for (let i = 0; i < bytes.byteLength; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode.apply(null, Array.from(chunk) as unknown as number[])
  }
  return btoa(binary)
}

/**
 * Checks if two audiences (origins) are from the same project
 * Allows tokens to work across subdomains (e.g., preview and production deployments)
 * @param tokenAudience The audience from the token
 * @param requestAudience The audience from the current request
 * @param allowedDomain Optional allowed domain for cross-subdomain matching
 * @returns boolean True if audiences are from the same project
 */
function audiencesMatch(tokenAudience: string, requestAudience: string, allowedDomain?: string): boolean {
  // Exact match - fastest path
  if (timingSafeEqual(tokenAudience, requestAudience)) return true

  // If no allowed domain configured, only exact matches are valid
  if (!allowedDomain) {
    return false
  }

  // Parse origins
  let tokenUrl: URL
  let requestUrl: URL
  try {
    tokenUrl = new URL(tokenAudience)
    requestUrl = new URL(requestAudience)
  } catch {
    return false
  }

  // Both must be HTTPS
  if (tokenUrl.protocol !== 'https:' || requestUrl.protocol !== 'https:') {
    return false
  }

  // Check if both hostnames are under the allowed domain or its subdomains
  const tokenIsAllowed = tokenUrl.hostname === allowedDomain || tokenUrl.hostname.endsWith(`.${allowedDomain}`)
  const requestIsAllowed = requestUrl.hostname === allowedDomain || requestUrl.hostname.endsWith(`.${allowedDomain}`)

  return tokenIsAllowed && requestIsAllowed
}

/**
 * Constant-time string comparison to prevent timing attacks
 * @param a First string
 * @param b Second string
 * @returns boolean True if strings are equal
 */
function timingSafeEqual(a: string, b: string): boolean {
  const aLen = a.length
  const bLen = b.length
  let mismatch = aLen === bLen ? 0 : 1
  const len = Math.max(aLen, bLen)
  for (let i = 0; i < len; i++) {
    const ac = a.charCodeAt(i) || 0
    const bc = b.charCodeAt(i) || 0
    mismatch |= ac ^ bc
  }
  return mismatch === 0
}
