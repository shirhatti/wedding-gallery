import { useState, useEffect, useMemo } from 'react'
import { Play } from 'lucide-react'
import Masonry from 'react-masonry-css'
import type { MediaItem } from '@/types'
import { Lightbox } from './Lightbox'
import { LazyImage } from './LazyImage'
import { Navigation } from './Navigation'
import { GalleryHeader } from './GalleryHeader'
import { cn } from '@/lib/utils'
import { LAYOUT_BREAKPOINTS, THUMBNAIL_SIZES } from '@/lib/constants'
import { fetchMediaList, getThumbnailUrl, getThumbnailSrcset } from '@/lib/mediaUrlResolver'

interface GalleryProps {
  scope: 'public' | 'private'
  filterBy?: 'image' | 'video'
}

export function Gallery({ scope, filterBy }: GalleryProps) {
  const [media, setMedia] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  // Filter media based on the type prop
  const filteredMedia = useMemo(() => {
    if (!filterBy) return media
    return media.filter(item => item.type === filterBy)
  }, [media, filterBy])

  // Open lightbox from query param (for shareable URLs)
  useEffect(() => {
    const url = new URL(window.location.href)
    const lightboxKey = url.searchParams.get('lightbox')

    if (lightboxKey && filteredMedia.length > 0 && selectedIndex === null) {
      const index = filteredMedia.findIndex(item => item.key === lightboxKey)
      if (index !== -1) {
        setSelectedIndex(index)
      }
    }
  }, [filteredMedia, selectedIndex])

  // Reset selected index when filter changes to prevent out-of-bounds errors
  useEffect(() => {
    setSelectedIndex(null)
  }, [filterBy])

  // Responsive breakpoints for masonry columns
  const breakpointColumns = {
    default: 5,
    [LAYOUT_BREAKPOINTS.LAPTOP]: 4,
    [LAYOUT_BREAKPOINTS.TABLET]: 3,
    [LAYOUT_BREAKPOINTS.MOBILE]: 2
  }

  // Load media using the service layer
  const loadMedia = async () => {
    setLoading(true)
    setError(null)

    try {
      const mediaList = await fetchMediaList(scope)
      setMedia(mediaList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load media')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMedia()
  }, [scope]) // Re-fetch when scope changes

  // Handle opening an item in the lightbox
  const handleItemClick = (_item: MediaItem, index: number) => {
    setSelectedIndex(index)
  }

  // Handle closing the lightbox
  const handleCloseLightbox = () => {
    setSelectedIndex(null)

    // Remove lightbox query param from URL
    const url = new URL(window.location.href)
    url.searchParams.delete('lightbox')
    window.history.replaceState(null, '', url.toString())
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

  const noMediaMessage = filteredMedia.length === 0
    ? filterBy === 'video'
      ? 'No videos found'
      : filterBy === 'image'
      ? 'No images found'
      : 'No media found'
    : null

  if (noMediaMessage) {
    return (
      <div className="min-h-screen bg-zinc-900">
        <GalleryHeader scope={scope} />
        <div className="flex items-center justify-center pt-20">
          <p className="text-xl text-zinc-400">{noMediaMessage}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-zinc-900 pb-8 pt-4 md:pt-8">
        {/* Header */}
        <GalleryHeader scope={scope} />

        {/* Navigation */}
        <Navigation scope={scope} />

        {/* Gallery Grid - Masonry Layout */}
        <div className="mx-auto max-w-[1600px] px-2 md:px-6">
          <Masonry
            breakpointCols={breakpointColumns}
            className="flex -ml-4 w-auto"
            columnClassName="pl-4 bg-clip-padding"
          >
            {filteredMedia.map((item, index) => (
              <button
                key={item.key}
                onClick={() => handleItemClick(item, index)}
                className={cn(
                  "group relative mb-4 overflow-hidden rounded-lg shadow-lg w-full",
                  "transition-all duration-300 hover:shadow-2xl hover:shadow-zinc-950/50 hover:-translate-y-1",
                  "focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-zinc-900"
                )}
              >
                {/* Thumbnail with natural aspect ratio */}
                <div className="relative w-full">
                  <LazyImage
                    src={getThumbnailUrl(item, scope, 'medium')}
                    srcset={getThumbnailSrcset(item, scope)}
                    sizes={THUMBNAIL_SIZES}
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
          media={filteredMedia}
          initialIndex={selectedIndex}
          onClose={handleCloseLightbox}
          scope={scope}
        />
      )}
    </>
  )
}
