import { useEffect, useRef, useState } from 'react'

interface UseIntersectionObserverOptions {
  rootMargin?: string
  threshold?: number
}

export function useIntersectionObserver(
  options: UseIntersectionObserverOptions = {}
) {
  const [isIntersecting, setIsIntersecting] = useState(false)
  const [isScrollingFast, setIsScrollingFast] = useState(false)
  const targetRef = useRef<HTMLDivElement>(null)
  const lastScrollY = useRef(window.scrollY)
  const lastScrollTime = useRef(Date.now())
  const scrollTimeoutRef = useRef<number>()

  // Track scroll velocity
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      const currentTime = Date.now()
      const timeDelta = currentTime - lastScrollTime.current
      const scrollDelta = Math.abs(currentScrollY - lastScrollY.current)

      // Calculate velocity in pixels per millisecond
      // If scrolling faster than 2 pixels/ms (2000px/sec), consider it fast
      const velocity = timeDelta > 0 ? scrollDelta / timeDelta : 0
      const isFast = velocity > 2

      if (isFast) {
        setIsScrollingFast(true)
      }

      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current)
      }

      // Set timeout to mark scrolling as stopped after 150ms of no scroll
      scrollTimeoutRef.current = window.setTimeout(() => {
        setIsScrollingFast(false)
      }, 150)

      lastScrollY.current = currentScrollY
      lastScrollTime.current = currentTime
    }

    window.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [])

  // Intersection observer
  useEffect(() => {
    const target = targetRef.current
    if (!target) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Only update intersection state if not scrolling fast
        if (!isScrollingFast) {
          setIsIntersecting(entry.isIntersecting)
        }
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
  }, [options.rootMargin, options.threshold, isScrollingFast])

  return { ref: targetRef, isIntersecting }
}
