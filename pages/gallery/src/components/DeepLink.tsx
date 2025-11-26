import { useParams } from 'react-router-dom'
import { Gallery } from './Gallery'

interface DeepLinkProps {
  type: 'image' | 'video'
}

export function DeepLink({ type }: DeepLinkProps) {
  const { key } = useParams<{ key: string }>()

  if (!key) {
    return <Gallery filterBy={type} />
  }

  // Decode the key (in case it was URL encoded)
  const decodedKey = decodeURIComponent(key)

  return <Gallery filterBy={type} initialKey={decodedKey} />
}
