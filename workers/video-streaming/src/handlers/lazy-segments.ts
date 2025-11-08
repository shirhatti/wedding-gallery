import type { VideoStreamingEnv } from "../types";
/**
 * Lazy segment signing handler
 * Signs HLS segments on-demand and redirects to presigned URL
 */

import { getSigningConfig } from "../lib/r2-signer";
import { getCachedSignedUrl, isVideoSigningEnabled } from "../lib/cached-url-signer";

/**
 * Handle lazy segment signing
 * URL format: /api/hls-segment/:videoKey/:segmentFile
 *
 * This endpoint:
 * 1. Checks KV cache for presigned URL
 * 2. Signs the segment URL if cache miss
 * 3. Redirects (302) to the presigned R2 URL
 *
 * Adds ~10-20ms latency on first fetch, but makes manifest generation instant
 */
export async function handleLazySegment(
  url: URL,
  env: VideoStreamingEnv,
  corsHeaders: Record<string, string>
): Promise<Response> {
  try {
    // Parse URL: /api/hls-segment/:videoKey/:segmentFile
    const pathParts = url.pathname.replace("/api/hls-segment/", "").split("/");

    if (pathParts.length < 2) {
      return new Response("Invalid segment path", {
        status: 400,
        headers: corsHeaders,
      });
    }

    const videoKey = decodeURIComponent(pathParts.slice(0, -1).join("/"));
    const segmentFile = decodeURIComponent(pathParts[pathParts.length - 1]);
    const segmentKey = `hls/${videoKey}/${segmentFile}`;

    // Check if video signing is enabled
    if (!isVideoSigningEnabled(env)) {
      return new Response("Presigned URLs not configured", {
        status: 500,
        headers: corsHeaders,
      });
    }

    const signingConfig = getSigningConfig(env);

    // Get or generate presigned URL (uses KV cache with 4-hour TTL)
    const signedUrl = await getCachedSignedUrl(
      env.VIDEO_CACHE,
      signingConfig,
      segmentKey,
      14400 // 4 hours
    );

    // Redirect to the presigned URL
    // The browser/player will fetch directly from R2
    return Response.redirect(signedUrl, 302);
  } catch (error) {
    console.error("Lazy segment signing error:", error);
    return new Response("Failed to sign segment", {
      status: 500,
      headers: corsHeaders,
    });
  }
}
