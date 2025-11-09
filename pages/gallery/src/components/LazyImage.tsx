import { useState, useEffect, useRef, useMemo } from 'react'
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver'
import { cn } from '@/lib/utils'
import { MOBILE_BREAKPOINT, LAZY_LOAD_ROOT_MARGINS } from '@/lib/constants'

interface LazyImageProps {
  src: string
  srcset?: string
  sizes?: string
  alt: string
  aspectRatio?: number // width / height
  className?: string
  onLoad?: () => void
}

/**
 * Lazy-loaded image component with responsive srcset support and intersection observer.
 *
 * Features:
 * - Defers image loading until the image enters the viewport
 * - Supports responsive images via srcset and sizes attributes
 * - Aggressive prefetching (2000-3000px rootMargin) for smooth scrolling
 * - Fade-in animation on load
 * - Preserves aspect ratio to prevent layout shift
 *
 * Important behavior notes:
 * - Once an image starts loading, its src/srcset are locked and won't update even if props change.
 *   This prevents interrupting in-progress loads and browser srcset re-selection.
 * - If viewport size changes (e.g., rotating device, resizing window), the browser won't
 *   re-select a different srcset candidate until the component remounts.
 * - To force an image update after initial load, remount the component with a new key prop.
 *
 * @example
 * ```tsx
 * <LazyImage
 *   src="/image-medium.jpg"
 *   srcset="/image-small.jpg 400w, /image-medium.jpg 800w, /image-large.jpg 1200w"
 *   sizes="(max-width: 640px) 100vw, 50vw"
 *   alt="Description"
 *   aspectRatio={16/9}
 * />
 * ```
 */
export function LazyImage({ src, srcset, sizes, alt, aspectRatio, className, onLoad }: LazyImageProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const imageSrcsetRef = useRef<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasError, setHasError] = useState(false)

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

  // Much more aggressive prefetching to handle scrolling to bottom
  // Memoize observer options to prevent unnecessary observer recreation
  // Only recreate when isMobile changes (e.g., device rotation, window resize)
  const observerOptions = useMemo(() => ({
    rootMargin: isMobile ? LAZY_LOAD_ROOT_MARGINS.MOBILE : LAZY_LOAD_ROOT_MARGINS.DESKTOP,
    threshold: 0.01,
  }), [isMobile])

  const { ref, isIntersecting } = useIntersectionObserver(observerOptions)

  // Lazy load image when it enters viewport
  // Note: The !imageSrc guard ensures that once loading starts, the image sources
  // won't change even if props update. This is intentional to:
  // 1. Prevent unnecessary re-renders during scroll
  // 2. Avoid interrupting in-progress image loads
  // 3. Stop the browser from re-selecting different srcset candidates mid-load
  // If you need to update the image after loading, remount the component with a new key.
  useEffect(() => {
    if (isIntersecting && !imageSrc) {
      setImageSrc(src)
      if (srcset) {
        imageSrcsetRef.current = srcset
      }
    }
  }, [isIntersecting, src, srcset, imageSrc])

  const handleLoad = () => {
    setIsLoaded(true)
    onLoad?.()
  }

  const handleError = () => {
    setHasError(true)
    console.error('Failed to load image:', src)
  }

  return (
    <div
      ref={ref}
      className="w-full relative"
      style={aspectRatio ? { aspectRatio: aspectRatio.toString() } : undefined}
    >
      {imageSrc && !hasError && (
        <img
          src={imageSrc}
          srcSet={imageSrcsetRef.current || undefined}
          sizes={sizes}
          alt={alt}
          onLoad={handleLoad}
          onError={handleError}
          className={cn(
            'w-full h-auto transition-opacity duration-300',
            isLoaded ? 'opacity-100' : 'opacity-0',
            className
          )}
        />
      )}
      {hasError && (
        <div className="w-full flex items-center justify-center bg-zinc-800 text-zinc-400 text-sm p-8">
          <div className="text-center">
            <svg
              className="mx-auto h-12 w-12 mb-2 opacity-50"
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
            <p>Failed to load image</p>
          </div>
        </div>
      )}
    </div>
  )
}
