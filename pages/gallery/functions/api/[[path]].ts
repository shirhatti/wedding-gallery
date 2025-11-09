/**
 * Pages Function to route API requests to appropriate workers
 * This consolidates all APIs under the same domain to fix cross-origin cookie issues
 */

interface Env {
  VIEWER_WORKER: Fetcher
  VIDEO_WORKER: Fetcher
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context
  const url = new URL(request.url)

  // Route video streaming endpoints to video-streaming worker
  if (url.pathname.startsWith('/api/hls') || url.pathname.startsWith('/api/hls-segment')) {
    return env.VIDEO_WORKER.fetch(request)
  }

  // Route all other API requests to viewer worker
  return env.VIEWER_WORKER.fetch(request)
}
