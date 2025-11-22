import { Link, useLocation } from 'react-router-dom'
import { Images, Video, LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavTabProps {
  to: string
  icon: LucideIcon
  label: string
  isActive: boolean
}

function NavTab({ to, icon: Icon, label, isActive }: NavTabProps) {
  return (
    <Link
      to={to}
      role="tab"
      aria-current={isActive ? 'page' : undefined}
      aria-selected={isActive}
      className={cn(
        'flex items-center gap-2 rounded-md px-6 py-2.5 text-sm font-medium transition-all',
        isActive
          ? 'bg-white text-zinc-900 shadow-sm'
          : 'text-zinc-400 hover:text-white'
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  )
}

export function Navigation() {
  const location = useLocation()

  return (
    <div className="mb-6 flex justify-center">
      <div className="inline-flex rounded-lg bg-zinc-800 p-1" role="tablist">
        <NavTab
          to="/images"
          icon={Images}
          label="Images"
          isActive={location.pathname === '/images'}
        />
        <NavTab
          to="/videos"
          icon={Video}
          label="Videos"
          isActive={location.pathname === '/videos'}
        />
      </div>
    </div>
  )
}
