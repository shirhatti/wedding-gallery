import { useState, useEffect } from 'react'
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver'
import { cn } from '@/lib/utils'

interface LazyImageProps {
  src: string
  alt: string
  className?: string
  onLoad?: () => void
}

export function LazyImage({ src, alt, className, onLoad }: LazyImageProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const isMobile = window.matchMedia('(max-width: 768px)').matches

  // More aggressive prefetching on mobile
  const { ref, isIntersecting } = useIntersectionObserver({
    rootMargin: isMobile ? '200px 0px' : '100px 0px',
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
    <div ref={ref} className="h-full w-full">
      {imageSrc && (
        <img
          src={imageSrc}
          alt={alt}
          onLoad={handleLoad}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-300',
            isLoaded ? 'opacity-100' : 'opacity-0',
            className
          )}
        />
      )}
    </div>
  )
}
