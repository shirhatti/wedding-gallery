import { signR2Url, getSigningConfig } from '../lib/r2-signer';

/**
 * Rewrites HLS master playlist to use pre-signed R2 URLs for segments
 * This keeps the Worker out of the video segment delivery path
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

    // Check if signing is configured
    if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
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
          const signedUrl = await signR2Url(signingConfig, segmentKey, 600); // 10 min TTL for segments
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
        'Cache-Control': 'private, max-age=60',
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
