import { getSigningConfig } from '../lib/r2-signer';
import { isVideoSigningEnabled } from '../lib/cached-url-signer';
import { batchSignWithCache } from '../lib/batch-r2-signer';

/**
 * Rewrites HLS master playlist to use pre-signed R2 URLs for segments
 * This keeps the Worker out of the video segment delivery path
 * Uses batch signing with KV caching for optimal performance
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

    // Check if video signing is configured
    // Video signing is always enabled when credentials are available (not behind feature flag)
    if (!isVideoSigningEnabled(env)) {
      return new Response(JSON.stringify({ error: 'Pre-signed URLs not configured' }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    const signingConfig = getSigningConfig(env);

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

    // Parse the playlist and collect all segment keys
    const lines = playlistContent.split('\n');
    const segmentIndices: number[] = [];
    const segmentKeys: string[] = [];

    lines.forEach((line, index) => {
      // Skip comments and empty lines
      if (!line.startsWith('#') && line.trim() !== '') {
        segmentIndices.push(index);
        segmentKeys.push(`hls/${videoKey}/${line.trim()}`);
      }
    });

    // Batch sign all segments with KV caching (4-hour TTL)
    // This is significantly faster than individual signing on cache misses
    const signedUrls = await batchSignWithCache(
      env.CACHE_VERSION,
      signingConfig,
      segmentKeys,
      14400 // 4 hours
    );

    // Reconstruct playlist with signed URLs
    const rewrittenLines = [...lines];
    segmentIndices.forEach((lineIndex, i) => {
      rewrittenLines[lineIndex] = signedUrls[i];
    });

    const rewrittenPlaylist = rewrittenLines.join('\n');

    return new Response(rewrittenPlaylist, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        // Cache for 1 hour since URLs are valid for 4 hours
        'Cache-Control': 'private, max-age=3600',
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
