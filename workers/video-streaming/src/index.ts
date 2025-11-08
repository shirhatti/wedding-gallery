/**
 * Video Streaming Worker
 * Dedicated worker for HLS video streaming with optimized signing
 */

import { handleHLSPlaylist } from "./handlers/hls";
import { handleLazySegment } from "./handlers/lazy-segments";
import { getSigningConfig } from "./lib/r2-signer";
import { isVideoSigningEnabled } from "./lib/cached-url-signer";
import { batchSignWithCache } from "./lib/batch-r2-signer";
import { generateProgressiveManifest } from "./lib/progressive-manifest";
import { sanitizeVideoKey, sanitizeFilename } from "./lib/security";
import type { VideoStreamingEnv } from "./types";

export default {
  async fetch(request: Request, env: VideoStreamingEnv): Promise<Response> {
    const url = new URL(request.url);

    // CORS headers
    const corsHeaders: Record<string, string> = {};
    const origin = request.headers.get("Origin");

    if (env.ALLOW_LOCALHOST_CORS === "true" && origin?.includes("localhost")) {
      corsHeaders["Access-Control-Allow-Origin"] = origin;
      corsHeaders["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS";
      corsHeaders["Access-Control-Allow-Headers"] = "Content-Type";
    } else if (env.PAGES_ORIGIN && origin === env.PAGES_ORIGIN) {
      corsHeaders["Access-Control-Allow-Origin"] = env.PAGES_ORIGIN;
      corsHeaders["Access-Control-Allow-Methods"] = "GET, HEAD, OPTIONS";
      corsHeaders["Access-Control-Allow-Headers"] = "Content-Type";
    }

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Route handling - video streaming only
    if (url.pathname === "/api/hls/playlist") {
      return handleHLSPlaylist(request, env, corsHeaders);
    } else if (url.pathname.startsWith("/api/hls-segment/")) {
      return handleLazySegment(url, env, corsHeaders);
    } else if (url.pathname.startsWith("/api/hls/")) {
      return handleGetHLS(url, env, corsHeaders);
    }

    return new Response("Not Found - Video Streaming Worker", { status: 404 });
  },
};

/**
 * Get HLS files (manifests and segments) from R2
 * For .m3u8 manifests: rewrites with pre-signed URLs for AirPlay support
 * For .ts segments: serves directly from R2
 */
async function handleGetHLS(url: URL, env: VideoStreamingEnv, corsHeaders: Record<string, string>): Promise<Response> {
  // URL format: /api/hls/{videoKey}/{filename}
  const pathParts = url.pathname.replace("/api/hls/", "").split("/");

  if (pathParts.length < 2) {
    return new Response("Invalid HLS path", { status: 400 });
  }

  const rawVideoKey = decodeURIComponent(pathParts.slice(0, -1).join("/"));
  const rawFilename = decodeURIComponent(pathParts[pathParts.length - 1]);

  // Sanitize inputs to prevent path traversal attacks
  const videoKey = sanitizeVideoKey(rawVideoKey);
  const filename = sanitizeFilename(rawFilename);
  const hlsKey = `hls/${videoKey}/${filename}`;

  try {
    const object = await env.R2_BUCKET.get(hlsKey);

    if (!object) {
      return new Response("HLS file not found", { status: 404 });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);

    // Set appropriate content type
    if (filename.endsWith(".m3u8")) {
      headers.set("Content-Type", "application/vnd.apple.mpegurl");
    } else if (filename.endsWith(".ts")) {
      headers.set("Content-Type", "video/MP2T");
    }

    // For .m3u8 manifests, rewrite with pre-signed URLs if video signing is enabled
    // This enables AirPlay to work by providing pre-signed URLs in the manifest
    if (filename.endsWith(".m3u8") && isVideoSigningEnabled(env)) {
      // Calculate time window for caching (4-hour buckets)
      const timeWindow = Math.floor(Date.now() / 1000 / 14400);
      const manifestCacheKey = `manifest:variant:${videoKey}:${filename}:${timeWindow}`;

      // Check manifest cache first (fastest path - single KV read)
      const cachedManifest = await env.VIDEO_CACHE.get(manifestCacheKey);
      if (cachedManifest) {
        headers.set("Content-Type", "application/vnd.apple.mpegurl");
        headers.set("Cache-Control", "private, max-age=3600");
        headers.set("X-Cache", "HIT");
        Object.keys(corsHeaders).forEach(key => headers.set(key, corsHeaders[key]));
        return new Response(cachedManifest, { headers });
      }

      // Cache miss - use progressive delivery for fast TTFB
      const manifestContent = await object.text();
      const signingConfig = getSigningConfig(env);

      // Progressive manifest delivery: stream first 5 segments immediately
      // while signing remaining in background
      const manifestStream = await generateProgressiveManifest(
        manifestContent,
        {
          initialSegments: 5, // Sign and stream first 5 segments immediately (~20s of video)
          batchSignUris: async (segmentUris) => {
            // Prepend HLS path to all segment URIs
            const fullKeys = segmentUris.map(uri => `hls/${videoKey}/${uri}`);

            // Batch sign all segments with KV caching (4-hour TTL)
            return await batchSignWithCache(
              env.VIDEO_CACHE,
              signingConfig,
              fullKeys,
              14400 // 4 hours
            );
          }
        }
      );

      // Note: We can't cache the streamed response directly
      // But individual segment URLs are cached in KV, so second request
      // will be fast anyway (~10ms from KV cache)

      headers.set("Cache-Control", "private, max-age=3600");
      headers.set("X-Cache", "MISS-PROGRESSIVE");
      Object.keys(corsHeaders).forEach(key => headers.set(key, corsHeaders[key]));

      return new Response(manifestStream, { headers });
    }

    // For non-manifest files or when signing is disabled, serve directly
    headers.set("Cache-Control", "public, max-age=2592000"); // Cache for 30 days
    headers.set("etag", object.httpEtag);
    Object.keys(corsHeaders).forEach(key => headers.set(key, corsHeaders[key]));

    return new Response(object.body, { headers });
  } catch {
    return new Response("Failed to retrieve HLS file", {
      status: 500,
      headers: corsHeaders
    });
  }
}
