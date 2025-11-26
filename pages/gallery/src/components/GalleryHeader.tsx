import { Link, useLocation } from 'react-router-dom'
import { Globe, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

interface GalleryHeaderProps {
  scope: 'public' | 'private'
}

export function GalleryHeader({ scope }: GalleryHeaderProps) {
  const location = useLocation()

  // Determine the current filter based on pathname
  const getPublicUrl = () => {
    if (location.pathname === '/private/images') return '/images'
    if (location.pathname === '/private/videos') return '/videos'
    if (location.pathname.startsWith('/private')) return '/'
    return location.pathname // Already on public route
  }

  const getPrivateUrl = () => {
    if (location.pathname === '/images') return '/private/images'
    if (location.pathname === '/videos') return '/private/videos'
    if (location.pathname === '/') return '/private'
    return '/private' // Default to private home
  }

  return (
    <div className="sticky top-0 z-40 mb-4 border-b border-zinc-800 bg-black px-4 py-4 md:relative md:border-none md:bg-transparent">
      <div className="relative flex items-center justify-center">
        <img
          src="https://assets.shirhatti.com/weddinglogo.svg"
          alt="Wedding Logo"
          className="h-10 w-auto md:h-15"
        />
        {/* Toggle Switch */}
        <div className="absolute right-0 inline-flex rounded-lg bg-zinc-800 p-1">
          <Link
            to={getPublicUrl()}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              scope === 'public'
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-400 hover:text-white'
            )}
          >
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">Public</span>
          </Link>
          <Link
            to={getPrivateUrl()}
            className={cn(
              'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
              scope === 'private'
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-400 hover:text-white'
            )}
          >
            <Lock className="h-4 w-4" />
            <span className="hidden sm:inline">Private</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
