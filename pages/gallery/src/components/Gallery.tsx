import { useState, useEffect, useMemo } from 'react'
import { Play } from 'lucide-react'
import Masonry from 'react-masonry-css'
import { MediaItem } from '@/types'
import { Lightbox } from './Lightbox'
import { LazyImage } from './LazyImage'
import { cn } from '@/lib/utils'

const API_BASE = import.meta.env.VITE_API_BASE || ''

export function Gallery() {
  const [media, setMedia] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  // Responsive breakpoints for masonry columns
  const breakpointColumns = {
    default: 5,
    1536: 4,
    1024: 3,
    640: 2
  }

  useEffect(() => {
    loadMedia()
  }, [])

  async function loadMedia() {
    try {
      const response = await fetch(`${API_BASE}/api/media`, {
        credentials: 'include',
      })

      if (!response.ok) {
        if (response.status === 401) {
          // Redirect to login page with returnTo parameter (pathname only, not full URL)
          const returnTo = encodeURIComponent(
            window.location.pathname + window.location.search
          )
          window.location.href = `/login?returnTo=${returnTo}`
          return
        }
        throw new Error('Failed to load media')
      }

      const data = await response.json()
      setMedia(data.media || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load media')
    } finally {
      setLoading(false)
    }
  }

  // Helper to get thumbnail URL - supports both pre-signed URLs and proxy mode
  // Note: Pre-signed URLs (item.urls) are only generated for 'medium' size thumbnails
  // to minimize backend processing. For 'small' and 'large' sizes, we always use
  // the proxy API endpoint which can serve all three sizes on-demand.
  const getThumbnailUrl = (item: MediaItem, size: 'small' | 'medium' | 'large' = 'medium'): string => {
    if (size === 'medium' && item.urls?.thumbnailMedium) {
      // Use pre-signed URL when available (reduces worker load)
      return item.urls.thumbnailMedium
    }
    // Fall back to proxy mode for all other cases (local dev or non-medium sizes)
    return `${API_BASE}/api/thumbnail/${item.key}?size=${size}`
  }

  // Generate srcset for responsive images
  const getThumbnailSrcset = (item: MediaItem): string => {
    return [
      `${getThumbnailUrl(item, 'small')} 150w`,
      `${getThumbnailUrl(item, 'medium')} 400w`,
      `${getThumbnailUrl(item, 'large')} 800w`,
    ].join(', ')
  }

  // Generate sizes attribute based on responsive breakpoints
  // Memoized since it returns the same value for all images
  const thumbnailSizes = useMemo(() => [
    '(max-width: 640px) 50vw',   // 2 columns on mobile
    '(max-width: 1024px) 33vw',  // 3 columns on tablet
    '(max-width: 1536px) 25vw',  // 4 columns on laptop
    '20vw'                        // 5 columns on desktop
  ].join(', '), [])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-900">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-700 border-t-white" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-900">
        <div className="text-center">
          <p className="text-xl text-red-400">{error}</p>
          <button
            onClick={loadMedia}
            className="mt-4 rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (media.length === 0) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-900">
        <p className="text-xl text-zinc-400">No media found</p>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-zinc-900 pb-8 pt-4 md:pt-8">
        {/* Header */}
        <div className="sticky top-0 z-40 mb-4 border-b border-zinc-800 bg-black px-4 py-4 text-center md:relative md:border-none md:bg-transparent">
          <img
            src="https://assets.shirhatti.com/weddinglogo.svg"
            alt="Wedding Logo"
            className="mx-auto h-10 w-auto md:h-15"
          />
        </div>

        {/* Gallery Grid - Masonry Layout */}
        <div className="mx-auto max-w-[1600px] px-2 md:px-6">
          <Masonry
            breakpointCols={breakpointColumns}
            className="flex -ml-4 w-auto"
            columnClassName="pl-4 bg-clip-padding"
          >
            {media.map((item, index) => (
              <button
                key={item.key}
                onClick={() => setSelectedIndex(index)}
                className={cn(
                  "group relative mb-4 overflow-hidden rounded-lg shadow-lg w-full",
                  "transition-all duration-300 hover:shadow-2xl hover:shadow-zinc-950/50 hover:-translate-y-1",
                  "focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-zinc-900"
                )}
              >
                {/* Thumbnail with natural aspect ratio */}
                <div className="relative w-full">
                  <LazyImage
                    src={getThumbnailUrl(item, 'medium')}
                    srcset={getThumbnailSrcset(item)}
                    sizes={thumbnailSizes}
                    alt={item.name}
                    aspectRatio={item.width && item.height ? item.width / item.height : undefined}
                  />
                  {/* Subtle gradient overlay on hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                </div>

                {/* Video indicator */}
                {item.type === 'video' && (
                  <>
                    <div className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-black/80 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-sm">
                      Video
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-xl backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
                        <Play className="h-7 w-7 text-zinc-900 ml-1" fill="currentColor" />
                      </div>
                    </div>
                  </>
                )}
              </button>
            ))}
          </Masonry>
        </div>
      </div>

      {/* Lightbox */}
      {selectedIndex !== null && (
        <Lightbox
          media={media}
          initialIndex={selectedIndex}
          onClose={() => setSelectedIndex(null)}
        />
      )}
    </>
  )
}
