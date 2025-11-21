import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { MediaPlayer, MediaProvider, isHLSProvider } from '@vidstack/react'
import { defaultLayoutIcons, DefaultVideoLayout } from '@vidstack/react/player/layouts/default'
import '@vidstack/react/player/styles/default/theme.css'
import '@vidstack/react/player/styles/default/layouts/video.css'
import { MediaItem } from '@/types'
import { Button } from '@/components/ui/button'
import { MOBILE_BREAKPOINT, LIGHTBOX_SIZES } from '@/lib/constants'

const API_BASE = import.meta.env.VITE_API_BASE || ''

interface LightboxProps {
  media: MediaItem[]
  initialIndex: number
  onClose: () => void
}

export function Lightbox({ media, initialIndex, onClose }: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const [imageError, setImageError] = useState(false)

  // Track mobile viewport state and update on resize/rotation
  const [isMobile, setIsMobile] = useState(() =>
    window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches
  )

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const currentItem = media[currentIndex]
  const isVideo = currentItem.type === 'video'

  // Reset error state when navigating to a new item
  useEffect(() => {
    setImageError(false)
  }, [currentIndex])

  // Helper to get original URL - supports both pre-signed URLs and proxy mode
  const getOriginalUrl = (item: MediaItem): string => {
    if (item.urls?.original) {
      // Pre-signed URL mode (when R2 credentials are configured)
      return item.urls.original
    }
    // Fallback to proxy mode (local dev without R2 credentials)
    return `${API_BASE}/api/file/${encodeURIComponent(item.key)}`
  }

  // Helper to get thumbnail URL - supports both pre-signed URLs and proxy mode
  // Uses same logic as Gallery component for consistency
  const getThumbnailUrl = (item: MediaItem, size: 'small' | 'medium' | 'large' = 'medium'): string => {
    if (size === 'medium' && item.urls?.thumbnailMedium) {
      // Use pre-signed URL when available (reduces worker load)
      return item.urls.thumbnailMedium
    }
    // Fall back to proxy mode for all other cases (local dev or non-medium sizes)
    // Important: URL-encode the key to handle filenames with spaces and special characters
    return `${API_BASE}/api/thumbnail/${encodeURIComponent(item.key)}?size=${size}`
  }

  // Generate srcset for lightbox - use large thumbnail for smaller viewports, original for larger
  const getLightboxSrcset = (item: MediaItem): string => {
    const sources = [`${getThumbnailUrl(item, 'large')} 800w`]
    // Use actual image width if available and valid
    if (item.width && item.width > 0) {
      // Round to integer since srcset width descriptors must be positive integers
      sources.push(`${getOriginalUrl(item)} ${Math.round(item.width)}w`)
    } else {
      // Fallback for missing/invalid width metadata
      // Use 3000w to represent typical modern camera output (2000-6000px range)
      // This ensures browser selects original for desktop viewing (90vw ≈ 1700px < 3000w)
      // while mobile still gets 800w thumbnail via explicit 800px sizes cap
      sources.push(`${getOriginalUrl(item)} 3000w`)
    }
    return sources.join(', ')
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft') {
        navigate(-1)
      } else if (e.key === 'ArrowRight') {
        navigate(1)
      }
    }

    if (!isMobile) {
      document.addEventListener('keydown', handleKeyDown)
    }
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [currentIndex, isMobile])

  const navigate = (direction: number) => {
    setCurrentIndex((prev) => (prev + direction + media.length) % media.length)
  }

  // Generate video source - prefer HLS if available, fallback to direct MP4
  const getVideoSource = (item: MediaItem): string => {
    // Vidstack will automatically detect HLS based on the response Content-Type
    return `${API_BASE}/api/hls/playlist?key=${encodeURIComponent(item.key)}`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95">
      {/* Close button */}
      <Button
        onClick={onClose}
        variant="ghost"
        size="icon"
        className="absolute left-4 top-4 z-50 rounded-full bg-black/70 text-white hover:bg-black/90 hover:text-white"
      >
        <X className="h-6 w-6" />
      </Button>

      {/* Navigation arrows (desktop only) */}
      {!isMobile && media.length > 1 && (
        <>
          <Button
            onClick={() => navigate(-1)}
            variant="ghost"
            size="icon"
            className="absolute left-4 top-1/2 z-50 h-16 w-16 -translate-y-1/2 rounded-none bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            <ChevronLeft className="h-8 w-8" />
          </Button>
          <Button
            onClick={() => navigate(1)}
            variant="ghost"
            size="icon"
            className="absolute right-4 top-1/2 z-50 h-16 w-16 -translate-y-1/2 rounded-none bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            <ChevronRight className="h-8 w-8" />
          </Button>
        </>
      )}

      {/* Media counter */}
      <div className="absolute right-4 top-4 z-50 rounded bg-black/70 px-3 py-1 text-sm text-white">
        {currentIndex + 1} / {media.length}
      </div>

      {/* Media content */}
      <div className="relative flex h-full w-full items-center justify-center p-4">
        {isVideo ? (
          <MediaPlayer
            src={getVideoSource(currentItem)}
            playsInline
            className="max-h-[90vh] max-w-full"
            onProviderChange={(provider) => {
              // Configure HLS.js when it's being used
              // Vidstack will automatically load hls.js from CDN
              if (isHLSProvider(provider)) {
                provider.config = {
                  enableWorker: true,
                  lowLatencyMode: false,
                  backBufferLength: 90,
                  xhrSetup: (xhr: XMLHttpRequest) => {
                    xhr.withCredentials = true
                  },
                }
              }
            }}
          >
            <MediaProvider />
            <DefaultVideoLayout icons={defaultLayoutIcons} />
          </MediaPlayer>
        ) : imageError ? (
          <div className="flex flex-col items-center justify-center text-zinc-400">
            <svg
              className="h-24 w-24 mb-4 opacity-50"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-lg mb-2">Failed to load image</p>
            <p className="text-sm opacity-75">{currentItem.name}</p>
          </div>
        ) : (
          <img
            src={getOriginalUrl(currentItem)}
            srcSet={getLightboxSrcset(currentItem)}
            sizes={LIGHTBOX_SIZES}
            alt={currentItem.name}
            onError={() => {
              setImageError(true)
              console.error('Failed to load image in lightbox:', currentItem.key)
            }}
            className="max-h-[90vh] max-w-full object-contain"
          />
        )}
      </div>
    </div>
  )
}
