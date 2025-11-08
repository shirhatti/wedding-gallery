import { rewriteMasterPlaylist } from '../lib/m3u8-handler';

/**
 * Handles HLS master playlist requests
 * Master playlist contains variant references (360p.m3u8, 720p.m3u8, etc.)
 * These are rewritten to worker URLs (not presigned) for fast response
 * Uses industry-standard m3u8-parser for robust playlist handling
 */
export async function handleHLSPlaylist(request: Request, env: any, corsHeaders: Record<string, string>) {
  try {
    const url = new URL(request.url);
    const videoKey = url.searchParams.get('key');

    if (!videoKey) {
      return new Response(JSON.stringify({ error: 'Missing key parameter' }), {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    // Calculate time window for caching (4-hour buckets)
    const timeWindow = Math.floor(Date.now() / 1000 / 14400);
    const manifestCacheKey = `manifest:master:${videoKey}:${timeWindow}`;

    // Check manifest cache (fastest path - single KV read)
    const cachedManifest = await env.CACHE_VERSION.get(manifestCacheKey);
    if (cachedManifest) {
      return new Response(cachedManifest, {
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'private, max-age=3600',
          'X-Cache': 'HIT',
          ...corsHeaders,
        },
      });
    }

    // Fetch the HLS master playlist from R2
    const playlistKey = `hls/${videoKey}/master.m3u8`;
    const playlistObj = await env.R2_BUCKET.get(playlistKey);

    if (!playlistObj) {
      return new Response(JSON.stringify({ error: 'HLS playlist not found' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    const playlistContent = await playlistObj.text();

    // Rewrite variant playlist references using robust M3U8 parser
    // Variant references like "360p.m3u8" become "/api/hls/video.mp4/360p.m3u8"
    const rewrittenPlaylist = await rewriteMasterPlaylist(playlistContent, {
      rewriteUri: (uri) => `/api/hls/${videoKey}/${uri}`
    });

    // Cache the rewritten manifest (90% of 4-hour TTL)
    const cacheTtl = Math.floor(14400 * 0.9);
    await env.CACHE_VERSION.put(manifestCacheKey, rewrittenPlaylist, {
      expirationTtl: cacheTtl
    });

    return new Response(rewrittenPlaylist, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'private, max-age=3600',
        'X-Cache': 'MISS',
        ...corsHeaders,
      },
    });
  } catch (error) {
    console.error('HLS playlist error:', error);
    return new Response(JSON.stringify({ error: 'Failed to generate playlist' }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders,
      },
    });
  }
}
