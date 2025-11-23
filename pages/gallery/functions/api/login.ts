/**
 * API endpoint for login authentication
 * Validates password and sets auth cookie
 */

import { createAuthToken, isValidReturnTo } from '@wedding-gallery/auth'

interface Env {
  GALLERY_PASSWORD?: string
  AUTH_SECRET?: string
  /** The allowed domain for authentication (e.g., "example.pages.dev") */
  ALLOWED_DOMAIN?: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const url = new URL(request.url)

  // Require AUTH_SECRET when password protection is enabled
  if (env.GALLERY_PASSWORD && !env.AUTH_SECRET) {
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const formData = await request.formData()
  const password = formData.get('password')?.toString() || ''
  const returnTo = formData.get('returnTo')?.toString() || '/'
  // Use configured domain or fallback to current hostname
  const allowedDomain = env.ALLOWED_DOMAIN || url.hostname
  const validReturnTo = isValidReturnTo(returnTo, allowedDomain) ? returnTo : '/'

  if (env.GALLERY_PASSWORD && password === env.GALLERY_PASSWORD) {
    const headers = new Headers()

    // Use the frontend's origin as the audience for cross-worker auth
    // Try Origin header first, then extract from Referer, finally fallback to url.origin
    let audience = request.headers.get('Origin')
    if (!audience) {
      const referer = request.headers.get('Referer')
      if (referer) {
        try {
          const refererUrl = new URL(referer)
          audience = refererUrl.origin
        } catch {}
      }
    }
    audience = audience || url.origin

    const token = await createAuthToken(
      {
        secret: env.AUTH_SECRET!,
        // Mock cacheVersion - not needed since changing AUTH_SECRET invalidates all tokens
        cacheVersion: { get: async () => null }
      },
      audience
    )

    // Only set Secure flag for HTTPS (production), not for local HTTP development
    const isSecure = url.protocol === 'https:'
    const secureCookie = isSecure ? '; Secure' : ''
    // For localhost (HTTP), use SameSite=Lax. For production (HTTPS), use SameSite=None
    const sameSite = isSecure ? 'SameSite=None' : 'SameSite=Lax'
    headers.set('Set-Cookie', `gallery_auth=${token}; Path=/; HttpOnly${secureCookie}; ${sameSite}; Max-Age=2592000`)
    headers.set('Content-Type', 'application/json')

    return new Response(JSON.stringify({ success: true, returnTo: validReturnTo }), {
      status: 200,
      headers
    })
  }

  return new Response(JSON.stringify({ error: 'Invalid password' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  })
}
