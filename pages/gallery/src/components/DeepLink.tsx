import { useParams } from 'react-router-dom'
import { Gallery } from './Gallery'

interface DeepLinkProps {
  type: 'image' | 'video'
}

export function DeepLink({ type }: DeepLinkProps) {
  const { key } = useParams<{ key: string }>()

  if (!key) {
    return <Gallery scope="public" filterBy={type} />
  }

  // Decode the key (in case it was URL encoded)
  const decodedKey = decodeURIComponent(key)

  // Determine scope based on key prefix
  const scope = decodedKey.startsWith('public/') ? 'public' : 'private'

  return <Gallery scope={scope} filterBy={type} initialKey={decodedKey} />
}
