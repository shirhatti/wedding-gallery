import { useState, useEffect } from 'react'
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver'
import { cn } from '@/lib/utils'

interface LazyImageProps {
  src: string
  alt: string
  aspectRatio?: number // width / height
  className?: string
  onLoad?: () => void
}

export function LazyImage({ src, alt, aspectRatio, className, onLoad }: LazyImageProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const isMobile = window.matchMedia('(max-width: 768px)').matches

  // Much more aggressive prefetching to handle scrolling to bottom
  const { ref, isIntersecting } = useIntersectionObserver({
    rootMargin: isMobile ? '3000px 0px' : '2000px 0px',
    threshold: 0.01,
  })

  useEffect(() => {
    if (isIntersecting && !imageSrc) {
      setImageSrc(src)
    }
  }, [isIntersecting, src, imageSrc])

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
