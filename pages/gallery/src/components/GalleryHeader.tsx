import { Link } from 'react-router-dom'
import { LogIn } from 'lucide-react'

interface GalleryHeaderProps {
  isAuthenticated?: boolean
}

export function GalleryHeader({ isAuthenticated = false }: GalleryHeaderProps) {
  return (
    <div className="sticky top-0 z-40 mb-4 border-b border-zinc-800 bg-black px-4 py-4 md:relative md:border-none md:bg-transparent">
      <div className="relative flex items-center justify-center">
        <img
          src="https://assets.shirhatti.com/weddinglogo.svg"
          alt="Wedding Logo"
          className="h-10 w-auto md:h-15"
        />
        {!isAuthenticated && (
          <Link
            to="/login"
            className="absolute right-0 flex items-center gap-2 rounded-md bg-white px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-100"
          >
            <LogIn className="h-4 w-4" />
            <span className="hidden sm:inline">Sign In</span>
          </Link>
        )}
      </div>
    </div>
  )
}
