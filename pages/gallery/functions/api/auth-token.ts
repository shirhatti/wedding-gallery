/**
 * API endpoint to get the current auth token for HLS URLs
 * Since the auth cookie is HttpOnly, JavaScript can't access it directly
 * This endpoint returns the token value so it can be appended to HLS URLs for iOS Safari
 */

import { getAuthCookie } from '@wedding-gallery/auth'

export const onRequestGet: PagesFunction = async (context) => {
  const { request } = context

  // Get the auth cookie
  const token = getAuthCookie(request)

  if (!token) {
    return new Response(JSON.stringify({ token: null }), {
      headers: { 'Content-Type': 'application/json' },
      status: 401
    })
  }

  return new Response(JSON.stringify({ token }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store' // Don't cache the token
    }
  })
}
