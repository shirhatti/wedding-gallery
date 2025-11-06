import { useState, useEffect } from 'react'
import { Play } from 'lucide-react'
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
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set())

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
          window.location.href = `${API_BASE}/login`
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

  const handleImageLoad = (key: string) => {
    setLoadedImages(prev => new Set(prev).add(key))
  }

  // Helper to get thumbnail URL - supports both pre-signed URLs and proxy mode
  const getThumbnailUrl = (item: MediaItem): string => {
    if (item.urls?.thumbnailMedium) {
      // Pre-signed URL mode (when R2 credentials are configured)
      return item.urls.thumbnailMedium
    }
    // Fallback to proxy mode (local dev without R2 credentials)
    return `${API_BASE}/api/thumbnail/${item.key}?size=medium`
  }

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

        {/* Gallery Grid */}
        <div className="mx-auto px-0 md:px-4">
          <div className="grid grid-cols-3 gap-0.5 md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))] md:gap-2.5">
            {media.map((item, index) => (
              <button
                key={item.key}
                onClick={() => setSelectedIndex(index)}
                className={cn(
                  "group relative aspect-square overflow-hidden bg-zinc-800",
                  "transition-transform hover:scale-105 md:rounded-md",
                  "focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-zinc-900"
                )}
              >
                {/* Thumbnail */}
                <LazyImage
                  src={getThumbnailUrl(item)}
                  alt={item.name}
                  onLoad={() => handleImageLoad(item.key)}
                />

                {/* Video indicator */}
                {item.type === 'video' && (
                  <>
                    <div className="absolute right-2 top-2 flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-xs text-white">
                      Video
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center opacity-80 transition-opacity group-hover:opacity-100">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/70">
                        <Play className="h-6 w-6 text-white ml-0.5" fill="white" />
                      </div>
                    </div>
                  </>
                )}
              </button>
            ))}
          </div>
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
