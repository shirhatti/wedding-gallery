import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

interface DeepLinkProps {
  type: 'image' | 'video'
}

export function DeepLink({ type }: DeepLinkProps) {
  const { key } = useParams<{ key: string }>()
  const navigate = useNavigate()

  useEffect(() => {
    if (key) {
      // Decode the key (in case it was URL encoded)
      const decodedKey = decodeURIComponent(key)

      // Determine scope and gallery URL based on key prefix
      const isPublic = decodedKey.startsWith('public/')
      const galleryUrl = isPublic
        ? (type === 'image' ? '/images' : '/videos')
        : (type === 'image' ? '/private/images' : '/private/videos')

      // Redirect to gallery with lightbox query param
      navigate(`${galleryUrl}?lightbox=${encodeURIComponent(decodedKey)}`, { replace: true })
    } else {
      // No key provided, just go to the filtered gallery
      const galleryUrl = type === 'image' ? '/images' : '/videos'
      navigate(galleryUrl, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Show loading while redirecting
  return (
    <div className="flex h-screen items-center justify-center bg-zinc-900">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-700 border-t-white" />
    </div>
  )
}
