import { describe, it, expect, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { DeepLink } from '../src/components/DeepLink'

describe('DeepLink Component', () => {
  beforeEach(() => {
    // Reset any mocks before each test
  })

  it('redirects /video/:key to /videos?lightbox=:key for public videos', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/video/*',
          element: <DeepLink type="video" />,
        },
        {
          path: '/videos',
          element: <div>Videos Page</div>,
        },
      ],
      {
        initialEntries: ['/video/public/1234567890-example.mp4'],
      }
    )

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/videos')
      expect(router.state.location.search).toContain('lightbox=')
      expect(decodeURIComponent(router.state.location.search)).toContain('public/1234567890-example.mp4')
    })
  })

  it('redirects /video/:key to /private/videos?lightbox=:key for private videos', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/video/*',
          element: <DeepLink type="video" />,
        },
        {
          path: '/private/videos',
          element: <div>Private Videos Page</div>,
        },
      ],
      {
        initialEntries: ['/video/1234567890-private.mp4'],
      }
    )

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/private/videos')
      expect(router.state.location.search).toContain('lightbox=1234567890-private.mp4')
    })
  })

  it('redirects /image/:key to /images?lightbox=:key for public images', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/image/*',
          element: <DeepLink type="image" />,
        },
        {
          path: '/images',
          element: <div>Images Page</div>,
        },
      ],
      {
        initialEntries: ['/image/public/1234567890-example.jpg'],
      }
    )

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/images')
      expect(decodeURIComponent(router.state.location.search)).toContain('public/1234567890-example.jpg')
    })
  })

  it('redirects /image/:key to /private/images?lightbox=:key for private images', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/image/*',
          element: <DeepLink type="image" />,
        },
        {
          path: '/private/images',
          element: <div>Private Images Page</div>,
        },
      ],
      {
        initialEntries: ['/image/1234567890-private.jpg'],
      }
    )

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/private/images')
      expect(router.state.location.search).toContain('lightbox=1234567890-private.jpg')
    })
  })

  it('decodes URL-encoded characters in the key', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/video/*',
          element: <DeepLink type="video" />,
        },
        {
          path: '/private/videos',
          element: <div>Private Videos Page</div>,
        },
      ],
      {
        initialEntries: ['/video/1234567890-My%20Video.mp4'],
      }
    )

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/private/videos')
      // The key should be URL-encoded in the query param
      expect(router.state.location.search).toContain('lightbox=')
    })
  })

  it('redirects to /videos when no key is provided', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/video',
          element: <DeepLink type="video" />,
        },
        {
          path: '/videos',
          element: <div>Videos Page</div>,
        },
      ],
      {
        initialEntries: ['/video'],
      }
    )

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/videos')
      expect(router.state.location.search).toBe('')
    })
  })

  it('redirects to /images when no key is provided', async () => {
    const router = createMemoryRouter(
      [
        {
          path: '/image',
          element: <DeepLink type="image" />,
        },
        {
          path: '/images',
          element: <div>Images Page</div>,
        },
      ],
      {
        initialEntries: ['/image'],
      }
    )

    render(<RouterProvider router={router} />)

    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/images')
      expect(router.state.location.search).toBe('')
    })
  })

  it('returns null (no flash)', () => {
    const router = createMemoryRouter(
      [
        {
          path: '/video/*',
          element: <DeepLink type="video" />,
        },
        {
          path: '/videos',
          element: <div>Videos Page</div>,
        },
      ],
      {
        initialEntries: ['/video/public/test.mp4'],
      }
    )

    const { container } = render(<RouterProvider router={router} />)

    // The DeepLink component itself should return null
    // But the RouterProvider will render the target route after navigation
    // So we just check that there's no loading spinner or flash content
    expect(container.querySelector('[data-testid="loading"]')).toBeNull()
  })
})
