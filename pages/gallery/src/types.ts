export interface MediaItem {
  key: string
  name: string
  type: 'image' | 'video'
  size: number
  uploadedAt: string
  width?: number
  height?: number
  urls?: {
    thumbnailMedium: string
    original: string
    hlsPlaylist?: string
  }
}

export interface ApiMediaResponse {
  media: MediaItem[]
  version: string
}
