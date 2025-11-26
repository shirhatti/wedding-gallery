import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Gallery } from '../src/components/Gallery'

describe('Access Control', () => {
  let locationHref: string

  beforeEach(() => {
    // Mock window.location.href
    locationHref = 'http://localhost/'

    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        pathname: '/',
        search: '',
        get href() {
          return locationHref
        },
        set href(value) {
          locationHref = value
        },
      },
    })

    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('redirects to login when accessing private gallery without auth', async () => {
    // Mock fetch to return 401
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    })

    render(
      <MemoryRouter>
        <Gallery scope="private" />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(locationHref).toContain('/login')
    }, { timeout: 2000 })
  })

  it('preserves return URL when redirecting to login', async () => {
    window.location.pathname = '/private/videos'
    window.location.search = '?lightbox=test.mp4'

    // Mock fetch to return 401
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    })

    render(
      <MemoryRouter>
        <Gallery scope="private" />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(locationHref).toContain('/login?returnTo=')
      expect(locationHref).toContain(encodeURIComponent('/private/videos?lightbox=test.mp4'))
    }, { timeout: 2000 })
  })

  it('loads media when accessing private gallery with valid auth', async () => {
    const mockMedia = [
      { key: 'public/1.jpg', type: 'image', name: 'Public Image', width: 100, height: 100 },
      { key: '2.jpg', type: 'image', name: 'Private Image', width: 100, height: 100 },
    ]

    // Mock fetch to return success
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ media: mockMedia }),
    })

    render(
      <MemoryRouter>
        <Gallery scope="private" />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/media'),
        expect.objectContaining({ credentials: 'include' })
      )
    })

    // Should not redirect to login
    expect(locationHref).not.toContain('/login')
  })

  it('public gallery does not redirect to login on 401', async () => {
    // Mock fetch to return 401 (shouldn't happen for public, but test behavior)
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    })

    render(
      <MemoryRouter>
        <Gallery scope="public" />
      </MemoryRouter>
    )

    // Wait a bit to ensure no redirect happens
    await new Promise(resolve => setTimeout(resolve, 100))

    // Should not redirect to login for public scope
    expect(locationHref).not.toContain('/login')
  })

  it('requests public scope API for public gallery', async () => {
    const mockMedia = [
      { key: 'public/1.jpg', type: 'image', name: 'Public Image', width: 100, height: 100 },
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
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/media?scope=public'),
        expect.objectContaining({ credentials: 'include' })
      )
    })
  })

  it('requests all media API for private gallery', async () => {
    const mockMedia = [
      { key: 'public/1.jpg', type: 'image', name: 'Public Image', width: 100, height: 100 },
      { key: '2.jpg', type: 'image', name: 'Private Image', width: 100, height: 100 },
    ]

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ media: mockMedia }),
    })

    render(
      <MemoryRouter>
        <Gallery scope="private" />
      </MemoryRouter>
    )

    await waitFor(() => {
      const calls = (fetch as any).mock.calls
      const apiMediaCall = calls.find((call: any) => call[0].includes('/api/media'))
      expect(apiMediaCall).toBeTruthy()
      expect(apiMediaCall[0]).not.toContain('scope=public')
    })
  })

  it.skip('shows error message on network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    render(
      <MemoryRouter>
        <Gallery scope="public" />
      </MemoryRouter>
    )

    await waitFor(() => {
      // Look for either the error message or the Retry button
      const retryButton = screen.queryByText('Retry')
      const errorText = screen.queryByText(/network error|failed to load/i)
      expect(retryButton || errorText).toBeTruthy()
    }, { timeout: 2000 })
  })
})
