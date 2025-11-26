import { useLayoutEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

interface DeepLinkProps {
  type: 'image' | 'video'
}

export function DeepLink({ type }: DeepLinkProps) {
  const { key } = useParams<{ key: string }>()
  const navigate = useNavigate()

  // Use useLayoutEffect to redirect before browser paint, eliminating flash
  useLayoutEffect(() => {
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
    // Empty deps: This component's sole purpose is to redirect once on mount.
    // After redirect, component unmounts (route changes), so re-running is unnecessary.
    // key, type, and navigate are captured from props/hooks at mount time.
    // useLayoutEffect runs synchronously before paint, eliminating loading flash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Return null since redirect happens before paint (useLayoutEffect)
  // This eliminates the loading spinner flash
  return null
}
