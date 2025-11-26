import { Link, useLocation } from 'react-router-dom'
import { Images, Video, LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavigationProps {
  scope: 'public' | 'private'
}

export function Navigation({ scope }: NavigationProps) {
  const location = useLocation()

  // Generate URLs based on scope
  const allUrl = scope === 'public' ? '/' : '/private'
  const imagesUrl = scope === 'public' ? '/images' : '/private/images'
  const videosUrl = scope === 'public' ? '/videos' : '/private/videos'

  // Determine which tab is active
  const isAllActive = scope === 'public'
    ? location.pathname === '/'
    : location.pathname === '/private'
  const isImagesActive = scope === 'public'
    ? location.pathname === '/images'
    : location.pathname === '/private/images'
  const isVideosActive = scope === 'public'
    ? location.pathname === '/videos'
    : location.pathname === '/private/videos'

  return (
    <div className="mb-6 flex justify-center">
      <div className="inline-flex rounded-lg bg-zinc-800 p-1" role="tablist">
        <Link
          to={allUrl}
          className={cn(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all',
            isAllActive
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-400 hover:text-white'
          )}
        >
          <LayoutGrid className="h-4 w-4" />
          <span>All</span>
        </Link>
        <Link
          to={imagesUrl}
          className={cn(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all',
            isImagesActive
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-400 hover:text-white'
          )}
        >
          <Images className="h-4 w-4" />
          <span>Images</span>
        </Link>
        <Link
          to={videosUrl}
          className={cn(
            'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all',
            isVideosActive
              ? 'bg-white text-zinc-900 shadow-sm'
              : 'text-zinc-400 hover:text-white'
          )}
        >
          <Video className="h-4 w-4" />
          <span>Videos</span>
        </Link>
      </div>
    </div>
  )
}
