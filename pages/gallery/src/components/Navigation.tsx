import { Link, useLocation } from 'react-router-dom'
import { Images, Video } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Navigation() {
  const location = useLocation()
  const isImages = location.pathname === '/images'
  const isVideos = location.pathname === '/videos'

  return (
    <div className="mb-6 flex justify-center">
      <div className="inline-flex rounded-lg bg-zinc-800 p-1">
        <Link
          to="/images"
          className={cn(
            "flex items-center gap-2 rounded-md px-6 py-2.5 text-sm font-medium transition-all",
            isImages
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-400 hover:text-white"
          )}
        >
          <Images className="h-4 w-4" />
          Images
        </Link>
        <Link
          to="/videos"
          className={cn(
            "flex items-center gap-2 rounded-md px-6 py-2.5 text-sm font-medium transition-all",
            isVideos
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-400 hover:text-white"
          )}
        >
          <Video className="h-4 w-4" />
          Videos
        </Link>
      </div>
    </div>
  )
}
