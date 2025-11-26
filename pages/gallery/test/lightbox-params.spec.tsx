import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Gallery } from '../src/components/Gallery'

// Store original methods
const originalLocation = window.location
const originalHistory = window.history

describe('Lightbox Query Parameters', () => {
  let replaceStateSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    // Mock window.location
    delete (window as any).location
    window.location = {
      ...originalLocation,
      href: 'http://localhost/',
      pathname: '/videos',
      search: '',
    } as any

    // Mock window.history.replaceState
    replaceStateSpy = vi.fn()
    window.history.replaceState = replaceStateSpy

    vi.clearAllMocks()
  })

  afterEach(() => {
    window.location = originalLocation
    window.history = originalHistory
  })

  it.skip('opens lightbox when ?lightbox=key is in URL', async () => {
    const mockMedia = [
      { key: 'public/1.mp4', type: 'video', name: 'Video 1', width: 100, height: 100 },
      { key: 'public/2.mp4', type: 'video', name: 'Video 2', width: 100, height: 100 },
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ media: mockMedia }),
    })

    // Set query param
    window.location.href = 'http://localhost/videos?lightbox=public/1.mp4'
    window.location.search = '?lightbox=public/1.mp4'

    // Mock URL constructor to return our search params
    const mockUrl = {
      searchParams: {
        get: (key: string) => key === 'lightbox' ? 'public/1.mp4' : null,
        set: vi.fn(),
        delete: vi.fn(),
      },
      toString: () => 'http://localhost/videos?lightbox=public/1.mp4',
    }
    global.URL = vi.fn(() => mockUrl) as any

    render(
      <MemoryRouter>
        <Gallery scope="public" filterBy="video" />
      </MemoryRouter>
    )

    // Wait for gallery to load
    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    })

    // Lightbox should be open (check for close button)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('does not open lightbox with invalid key in query param', async () => {
    const mockMedia = [
      { key: 'public/1.mp4', type: 'video', name: 'Video 1', width: 100, height: 100 },
      { key: 'public/2.mp4', type: 'video', name: 'Video 2', width: 100, height: 100 },
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ media: mockMedia }),
    })

    window.location.search = '?lightbox=nonexistent-key'

    const mockUrl = {
      searchParams: {
        get: (key: string) => key === 'lightbox' ? 'nonexistent-key' : null,
        set: vi.fn(),
        delete: vi.fn(),
      },
      toString: () => 'http://localhost/videos?lightbox=nonexistent-key',
    }
    global.URL = vi.fn(() => mockUrl) as any

    render(
      <MemoryRouter>
        <Gallery scope="public" filterBy="video" />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.queryByText(/loading/i)).not.toBeInTheDocument()
    })

    // Lightbox should not be open
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument()

    // Gallery should display normally
    const items = screen.getAllByRole('button')
    expect(items.length).toBeGreaterThan(0)
  })

  it.skip('removes lightbox query param when lightbox closes', async () => {
    const mockMedia = [
      { key: 'public/1.mp4', type: 'video', name: 'Video 1', width: 100, height: 100 },
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ media: mockMedia }),
    })

    const deleteSpy = vi.fn()
    const mockUrl = {
      searchParams: {
        get: (key: string) => key === 'lightbox' ? 'public/1.mp4' : null,
        set: vi.fn(),
        delete: deleteSpy,
      },
      toString: () => 'http://localhost/videos',
    }
    global.URL = vi.fn(() => mockUrl) as any

    render(
      <MemoryRouter>
        <Gallery scope="public" filterBy="video" />
      </MemoryRouter>
    )

    // Wait for lightbox to open
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
    }, { timeout: 3000 })

    // Click close button
    const closeButton = screen.getByRole('button', { name: /close/i })
    await userEvent.click(closeButton)

    // Should remove lightbox param
    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('lightbox')
    })
  })

  it.skip('waits for media to load before opening lightbox from query param', async () => {
    const mockMedia = [
      { key: 'public/1.mp4', type: 'video', name: 'Video 1', width: 100, height: 100 },
    ]

    // Delay the fetch response to simulate loading
    let resolveFetch: (value: any) => void
    const fetchPromise = new Promise((resolve) => {
      resolveFetch = resolve
    })

    global.fetch = vi.fn().mockReturnValue(fetchPromise)

    window.location.search = '?lightbox=public/1.mp4'

    const mockUrl = {
      searchParams: {
        get: (key: string) => key === 'lightbox' ? 'public/1.mp4' : null,
        set: vi.fn(),
        delete: vi.fn(),
      },
      toString: () => 'http://localhost/videos?lightbox=public/1.mp4',
    }
    global.URL = vi.fn(() => mockUrl) as any

    render(
      <MemoryRouter>
        <Gallery scope="public" filterBy="video" />
      </MemoryRouter>
    )

    // Should show loading spinner
    expect(screen.getByText(/loading/i)).toBeInTheDocument()

    // Lightbox should not be open yet
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument()

    // Resolve the fetch
    resolveFetch!({
      ok: true,
      json: async () => ({ media: mockMedia }),
    })

    // Wait for media to load and lightbox to open
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it.skip('updates URL when navigating in lightbox', async () => {
    const mockMedia = [
      { key: 'public/1.mp4', type: 'video', name: 'Video 1', width: 100, height: 100 },
      { key: 'public/2.mp4', type: 'video', name: 'Video 2', width: 100, height: 100 },
    ]

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ media: mockMedia }),
      })
      .mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'test-token' }),
      })

    const setSpy = vi.fn()
    const mockUrl = {
      searchParams: {
        get: (key: string) => key === 'lightbox' ? 'public/1.mp4' : null,
        set: setSpy,
        delete: vi.fn(),
      },
      toString: () => 'http://localhost/videos?lightbox=public/1.mp4',
    }
    global.URL = vi.fn(() => mockUrl) as any

    window.location.search = '?lightbox=public/1.mp4'

    render(
      <MemoryRouter>
        <Gallery scope="public" filterBy="video" />
      </MemoryRouter>
    )

    // Wait for lightbox to open
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
    }, { timeout: 3000 })

    // Find and click next button
    const nextButton = screen.getByRole('button', { name: /next/i })
    await userEvent.click(nextButton)

    // URL should be updated with new key
    await waitFor(() => {
      expect(setSpy).toHaveBeenCalledWith('lightbox', 'public/2.mp4')
    })

    // Should use replaceState, not pushState
    expect(replaceStateSpy).toHaveBeenCalled()
  })

  it.skip('handles URL-encoded characters in lightbox key', async () => {
    const mockMedia = [
      { key: 'public/My Video.mp4', type: 'video', name: 'My Video', width: 100, height: 100 },
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ media: mockMedia }),
    })

    window.location.search = '?lightbox=public%2FMy%20Video.mp4'

    const mockUrl = {
      searchParams: {
        get: (key: string) => key === 'lightbox' ? 'public/My Video.mp4' : null,
        set: vi.fn(),
        delete: vi.fn(),
      },
      toString: () => 'http://localhost/videos?lightbox=public%2FMy%20Video.mp4',
    }
    global.URL = vi.fn(() => mockUrl) as any

    render(
      <MemoryRouter>
        <Gallery scope="public" filterBy="video" />
      </MemoryRouter>
    )

    // Wait for lightbox to open
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
    }, { timeout: 3000 })
  })
})
