/**
 * Media URL Resolver Service
 *
 * Centralizes all URL construction logic for media assets.
 * Handles direct URLs, pre-signed URLs, and proxy URLs based on scope.
 */

import type { MediaItem } from '@/types'

const API_BASE = import.meta.env.VITE_API_BASE || ''
const PUBLIC_BUCKET_URL = 'https://media.jessandsourabh.com'

export type Scope = 'public' | 'private'
export type ThumbnailSize = 'small' | 'medium' | 'large'

/**
 * Fetch media list
 * - Public: fetches manifest from R2 (no worker call)
 * - Private: fetches from worker API (auth required)
 */
export async function fetchMediaList(scope: Scope): Promise<MediaItem[]> {
  if (scope === 'public') {
    // Fetch public manifest directly from R2
    const manifestUrl = `${PUBLIC_BUCKET_URL}/_metadata/public-manifest.json`
    const response = await fetch(manifestUrl)

    if (!response.ok) {
      throw new Error('Failed to load public manifest')
    }

    const data = await response.json()
    return data.media || []
  } else {
    // Fetch from worker API (private, auth required)
    const response = await fetch(`${API_BASE}/api/media`, {
      credentials: 'include',
    })

    if (!response.ok) {
      if (response.status === 401) {
        // Redirect to login for private routes
        const returnTo = encodeURIComponent(
          window.location.pathname + window.location.search
        )
        window.location.href = `/login?returnTo=${returnTo}`
        throw new Error('Authentication required')
      }
      throw new Error('Failed to load media')
    }

    const data = await response.json()
    return data.media || []
  }
}

/**
 * Get thumbnail URL for a media item
 * - Public: always direct R2 URLs (no worker)
 * - Private: pre-signed URLs if available, otherwise worker proxy
 */
export function getThumbnailUrl(
  item: MediaItem,
  scope: Scope,
  size: ThumbnailSize = 'medium'
): string {
  if (scope === 'public') {
    // Public: always use direct R2 URLs (manifest already has them for medium)
    if (size === 'medium' && item.urls?.thumbnailMedium) {
      return item.urls.thumbnailMedium
    }
    // For other sizes, construct direct URL
    return `${PUBLIC_BUCKET_URL}/thumbnails/${size}/${item.key}`
  } else {
    // Private: use pre-signed URL if available, otherwise worker proxy
    if (size === 'medium' && item.urls?.thumbnailMedium) {
      return item.urls.thumbnailMedium
    }
    return `${API_BASE}/api/thumbnail/${encodeURIComponent(item.key)}?size=${size}`
  }
}

/**
 * Get original file URL for a media item
 * - Public: always direct R2 URLs (no worker)
 * - Private: pre-signed URLs if available, otherwise worker proxy
 */
export function getOriginalUrl(item: MediaItem, scope: Scope): string {
  if (scope === 'public') {
    // Public: always use direct R2 URLs (manifest already has them)
    if (item.urls?.original) {
      return item.urls.original
    }
    return `${PUBLIC_BUCKET_URL}/${item.key}`
  } else {
    // Private: use pre-signed URL if available, otherwise worker proxy
    if (item.urls?.original) {
      return item.urls.original
    }
    return `${API_BASE}/api/file/${encodeURIComponent(item.key)}`
  }
}

/**
 * Generate responsive srcset for thumbnails
 */
export function getThumbnailSrcset(item: MediaItem, scope: Scope): string {
  return [
    `${getThumbnailUrl(item, scope, 'small')} 150w`,
    `${getThumbnailUrl(item, scope, 'medium')} 400w`,
    `${getThumbnailUrl(item, scope, 'large')} 800w`,
  ].join(', ')
}

/**
 * Generate responsive srcset for lightbox images
 * Uses large thumbnail for smaller viewports, original for larger
 */
export function getLightboxSrcset(item: MediaItem, scope: Scope): string {
  const sources = [`${getThumbnailUrl(item, scope, 'large')} 800w`]

  // Use actual image width if available and valid
  if (item.width && item.width > 0) {
    sources.push(`${getOriginalUrl(item, scope)} ${Math.round(item.width)}w`)
  } else {
    // Fallback for missing/invalid width metadata
    // Use 3000w to represent typical modern camera output
    sources.push(`${getOriginalUrl(item, scope)} 3000w`)
  }

  return sources.join(', ')
}

/**
 * Get HLS playlist URL for a video
 * - Public: direct R2 URL to master.m3u8 (no worker)
 * - Private: video-streaming worker (auth required)
 */
export function getHLSPlaylistUrl(
  item: MediaItem,
  scope: Scope,
  authToken?: string | null
): string {
  if (scope === 'public') {
    // Public: direct R2 URL to HLS master playlist
    return `${PUBLIC_BUCKET_URL}/hls/${item.key}/master.m3u8`
  } else {
    // Private: video-streaming worker
    let url = `${API_BASE}/api/hls/playlist?key=${encodeURIComponent(item.key)}`

    // Add auth token for iOS Safari (doesn't send cookies with HLS requests)
    if (authToken) {
      url += `&token=${encodeURIComponent(authToken)}`
    }

    return url
  }
}

/**
 * Get auth token endpoint
 */
export function getAuthTokenUrl(): string {
  return `${API_BASE}/api/auth-token`
}

/**
 * Get cache version endpoint
 */
export function getCacheVersionUrl(): string {
  return `${API_BASE}/api/cache-version`
}
