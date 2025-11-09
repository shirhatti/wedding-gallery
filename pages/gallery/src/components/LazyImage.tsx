import { useState, useEffect } from 'react'
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

export function LazyImage({ src, srcset, sizes, alt, aspectRatio, className, onLoad }: LazyImageProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [imageSrcset, setImageSrcset] = useState<string | null>(null)
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
        setImageSrcset(srcset)
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
          srcSet={imageSrcset || undefined}
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
