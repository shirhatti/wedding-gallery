import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import Hls from 'hls.js'
import { MediaItem } from '@/types'
import { Button } from '@/components/ui/button'

const API_BASE = import.meta.env.VITE_API_BASE || ''

interface LightboxProps {
  media: MediaItem[]
  initialIndex: number
  onClose: () => void
}

export function Lightbox({ media, initialIndex, onClose }: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hlsRef = useRef<Hls | null>(null)
  const isMobile = window.matchMedia('(max-width: 768px)').matches

  const currentItem = media[currentIndex]
  const isVideo = currentItem.type === 'video'

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
      cleanupVideo()
    }
  }, [currentIndex, isMobile])

  useEffect(() => {
    if (isVideo && videoRef.current) {
      loadVideo()
    } else {
      cleanupVideo()
    }

    return () => cleanupVideo()
  }, [currentIndex, isVideo])

  const cleanupVideo = () => {
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.src = ''
    }
  }

  const loadVideo = async () => {
    if (!videoRef.current) return

    const video = videoRef.current
    const hlsUrl = `${API_BASE}/api/hls/playlist?key=${currentItem.key}`

    try {
      // Check if HLS is available
      const hlsCheck = await fetch(hlsUrl, { method: 'HEAD', credentials: 'include' })

      if (hlsCheck.ok && Hls.isSupported()) {
        // Use HLS.js
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
        })

        hlsRef.current = hls
        hls.loadSource(hlsUrl)
        hls.attachMedia(video)

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          video.play().catch(() => {})
        })

        hls.on(Hls.Events.ERROR, (event, data) => {
          if (data.fatal) {
            console.error('HLS fatal error, falling back to MP4')
            cleanupVideo()
            video.src = currentItem.urls.original
            video.load()
          }
        })
      } else if (hlsCheck.ok && video.canPlayType('application/vnd.apple.mpegurl')) {
        // Native HLS support (Safari)
        video.src = hlsUrl
        video.load()
      } else {
        throw new Error('HLS not available')
      }
    } catch (e) {
      // Fall back to direct MP4
      video.src = currentItem.urls.original
      video.load()
    }
  }

  const navigate = (direction: number) => {
    cleanupVideo()
    setCurrentIndex((prev) => (prev + direction + media.length) % media.length)
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
          <video
            ref={videoRef}
            controls
            className="max-h-[90vh] max-w-full"
            playsInline
          />
        ) : (
          <img
            src={currentItem.urls.original}
            alt={currentItem.name}
            className="max-h-[90vh] max-w-full object-contain"
          />
        )}
      </div>
    </div>
  )
}
