import { getSigningConfig } from '../lib/r2-signer';
import { getCachedSignedUrl, isVideoSigningEnabled } from '../lib/cached-url-signer';

/**
 * Rewrites HLS master playlist to use pre-signed R2 URLs for segments
 * This keeps the Worker out of the video segment delivery path
 * Uses KV caching with 4-hour TTL to avoid CPU thrashing
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

    // Parse and rewrite the playlist
    // Replace relative segment paths with absolute pre-signed URLs
    // Uses KV cache with 4-hour TTL to minimize CPU-intensive signing operations
    const lines = playlistContent.split('\n');
    const rewrittenLines = await Promise.all(
      lines.map(async (line) => {
        // Skip comments and empty lines
        if (line.startsWith('#') || line.trim() === '') {
          return line;
        }

        // This is a segment or variant playlist reference
        // Rewrite it to an absolute pre-signed URL
        const segmentKey = `hls/${videoKey}/${line.trim()}`;

        try {
          // Use 4-hour TTL with KV caching to avoid CPU thrashing
          const signedUrl = await getCachedSignedUrl(
            env.CACHE_VERSION,
            signingConfig,
            segmentKey,
            14400 // 4 hours
          );
          return signedUrl;
        } catch (error) {
          console.error(`Failed to sign segment ${segmentKey}:`, error);
          return line; // Fallback to original if signing fails
        }
      })
    );

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
