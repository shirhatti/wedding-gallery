/**
 * Pages Function to route login requests to viewer worker
 */

interface Env {
  VIEWER_WORKER: Fetcher
}

export const onRequest: PagesFunction<Env> = async (context) => {
  return context.env.VIEWER_WORKER.fetch(context.request)
}
