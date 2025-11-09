import { useState, useEffect, useRef } from 'react'
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver'
import { cn } from '@/lib/utils'

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
  const isMobile = window.matchMedia('(max-width: 768px)').matches

  // Much more aggressive prefetching to handle scrolling to bottom
  const { ref, isIntersecting } = useIntersectionObserver({
    rootMargin: isMobile ? '3000px 0px' : '2000px 0px',
    threshold: 0.01,
  })

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

  return (
    <div
      ref={ref}
      className="w-full relative"
      style={aspectRatio ? { aspectRatio: aspectRatio.toString() } : undefined}
    >
      {imageSrc && (
        <img
          src={imageSrc}
          srcSet={imageSrcsetRef.current || undefined}
          sizes={sizes}
          alt={alt}
          onLoad={handleLoad}
          className={cn(
            'w-full h-auto transition-opacity duration-300',
            isLoaded ? 'opacity-100' : 'opacity-0',
            className
          )}
        />
      )}
    </div>
  )
}
