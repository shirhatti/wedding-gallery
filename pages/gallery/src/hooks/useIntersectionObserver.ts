import { useEffect, useRef, useState } from 'react'

interface UseIntersectionObserverOptions {
  rootMargin?: string
  threshold?: number
}

export function useIntersectionObserver(
  options: UseIntersectionObserverOptions = {}
) {
  const [isIntersecting, setIsIntersecting] = useState(false)
  const targetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const target = targetRef.current
    if (!target) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsIntersecting(entry.isIntersecting)
      },
      {
        rootMargin: options.rootMargin || '100px 0px',
        threshold: options.threshold || 0.01,
      }
    )

    observer.observe(target)

    return () => {
      observer.unobserve(target)
    }
  }, [options.rootMargin, options.threshold])

  return { ref: targetRef, isIntersecting }
}
