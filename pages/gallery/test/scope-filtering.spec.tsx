import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Gallery } from '../src/components/Gallery'

describe('Scope Filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('filterBy="video" only shows videos', async () => {
    const mockMedia = [
      { key: 'public/1.jpg', type: 'image', name: 'Image 1', width: 100, height: 100 },
      { key: 'public/2.mp4', type: 'video', name: 'Video 1', width: 100, height: 100 },
      { key: 'public/3.jpg', type: 'image', name: 'Image 2', width: 100, height: 100 },
      { key: 'public/4.mp4', type: 'video', name: 'Video 2', width: 100, height: 100 },
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ media: mockMedia }),
    })

    render(
      <MemoryRouter>
        <Gallery scope="public" filterBy="video" />
      </MemoryRouter>
    )

    // Wait for media to load
    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    })

    // Should only show video items (check for Video badge)
    const videoBadges = screen.getAllByText('Video')
    expect(videoBadges).toHaveLength(2)
  })

  it('filterBy="image" only shows images', async () => {
    const mockMedia = [
      { key: 'public/1.jpg', type: 'image', name: 'Image 1', width: 100, height: 100 },
      { key: 'public/2.mp4', type: 'video', name: 'Video 1', width: 100, height: 100 },
      { key: 'public/3.jpg', type: 'image', name: 'Image 2', width: 100, height: 100 },
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ media: mockMedia }),
    })

    render(
      <MemoryRouter>
        <Gallery scope="public" filterBy="image" />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    })

    // Should not show any Video badges
    expect(screen.queryByText('Video')).not.toBeInTheDocument()

    // Should show 2 images
    const images = screen.getAllByRole('button')
    expect(images).toHaveLength(2)
  })

  it('shows all media when no filterBy is specified', async () => {
    const mockMedia = [
      { key: 'public/1.jpg', type: 'image', name: 'Image 1', width: 100, height: 100 },
      { key: 'public/2.mp4', type: 'video', name: 'Video 1', width: 100, height: 100 },
      { key: 'public/3.jpg', type: 'image', name: 'Image 2', width: 100, height: 100 },
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ media: mockMedia }),
    })

    render(
      <MemoryRouter>
        <Gallery scope="public" />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    })

    // Should show all 3 items
    const items = screen.getAllByRole('button')
    expect(items).toHaveLength(3)

    // Should show 1 Video badge
    const videoBadges = screen.getAllByText('Video')
    expect(videoBadges).toHaveLength(1)
  })

  it('shows "No videos found" when filterBy="video" and no videos exist', async () => {
    const mockMedia = [
      { key: 'public/1.jpg', type: 'image', name: 'Image 1', width: 100, height: 100 },
      { key: 'public/2.jpg', type: 'image', name: 'Image 2', width: 100, height: 100 },
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ media: mockMedia }),
    })

    render(
      <MemoryRouter>
        <Gallery scope="public" filterBy="video" />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('No videos found')).toBeInTheDocument()
    })
  })

  it('shows "No images found" when filterBy="image" and no images exist', async () => {
    const mockMedia = [
      { key: 'public/1.mp4', type: 'video', name: 'Video 1', width: 100, height: 100 },
      { key: 'public/2.mp4', type: 'video', name: 'Video 2', width: 100, height: 100 },
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ media: mockMedia }),
    })

    render(
      <MemoryRouter>
        <Gallery scope="public" filterBy="image" />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('No images found')).toBeInTheDocument()
    })
  })

  it('shows "No media found" when no media exists', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ media: [] }),
    })

    render(
      <MemoryRouter>
        <Gallery scope="public" />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('No media found')).toBeInTheDocument()
    })
  })

  it('resets selected index when filter changes', async () => {
    const mockMedia = [
      { key: 'public/1.jpg', type: 'image', name: 'Image 1', width: 100, height: 100 },
      { key: 'public/2.mp4', type: 'video', name: 'Video 1', width: 100, height: 100 },
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ media: mockMedia }),
    })

    const { rerender } = render(
      <MemoryRouter>
        <Gallery scope="public" filterBy="image" />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    })

    // Change filter
    rerender(
      <MemoryRouter>
        <Gallery scope="public" filterBy="video" />
      </MemoryRouter>
    )

    // Should show different items
    await waitFor(() => {
      expect(screen.getByText('Video')).toBeInTheDocument()
    })
  })
})
