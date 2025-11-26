/**
 * Video Streaming Worker
 * Dedicated worker for HLS video streaming with optimized signing
 */

import { handleHLSPlaylist } from "./handlers/hls";
import { handleLazySegment } from "./handlers/lazy-segments";
import {
  getSigningConfig,
  isVideoSigningEnabled,
  batchSignWithCache,
  generateProgressiveManifest
} from "@wedding-gallery/shared-video-lib";
import { validateAuthToken, getAuthCookie } from "@wedding-gallery/auth";
import { sanitizeVideoKey, sanitizeFilename } from "./lib/security";
import type { VideoStreamingEnv } from "./types";

export default {
  async fetch(request: Request, env: VideoStreamingEnv): Promise<Response> {
    const url = new URL(request.url);

    // Check if this is a public video resource (bypass auth)
    let isPublicResource = false;
    if (url.pathname === "/api/hls/playlist") {
      const videoKey = url.searchParams.get("key") || "";
      isPublicResource = videoKey.startsWith("public/");
    } else if (url.pathname.startsWith("/api/hls/") || url.pathname.startsWith("/api/hls-segment/")) {
      // Extract video key from path: /api/hls/{videoKey}/{filename}
      const pathWithoutPrefix = url.pathname.replace("/api/hls/", "").replace("/api/hls-segment/", "");
      const pathParts = pathWithoutPrefix.split("/");
      if (pathParts.length >= 1) {
        const videoKey = decodeURIComponent(pathParts[0]);
        isPublicResource = videoKey.startsWith("public/");
      }
    }

    // Check authentication for private resources unless explicitly disabled
    if (!isPublicResource && env.DISABLE_AUTH !== "true") {
      if (!env.GALLERY_PASSWORD || !env.AUTH_SECRET) {
        throw new Error("Auth is enabled but GALLERY_PASSWORD or AUTH_SECRET is not configured");
      }

      // Try to get auth from cookie first, then from query parameter
      // Query parameter is needed for iOS Safari which doesn't send cookies with HLS requests
      let authValue = getAuthCookie(request);
      if (!authValue) {
        authValue = url.searchParams.get("token") || "";
      }

      // Use shared auth library with config adapter
      const authConfig = {
        secret: env.AUTH_SECRET,
        cacheVersion: {
          get: async (key: string) => env.VIDEO_CACHE.get(key)
        },
        disableAuth: false
      };

      // Use the same audience as the viewer worker (frontend origin)
      // Extract from Referer header (works with Vite proxy and Pages)
      let audience = url.origin;
      const referer = request.headers.get("Referer");
      if (referer) {
        try {
          const refererUrl = new URL(referer);
          audience = refererUrl.origin;
        } catch {}
      }

      const valid = await validateAuthToken(authConfig, audience, authValue);

      if (!valid) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: {
            "Content-Type": "application/json",
          }
        });
      }
    }

    // Route handling - video streaming only
    if (url.pathname === "/api/hls/playlist") {
      return handleHLSPlaylist(request, env);
    } else if (url.pathname.startsWith("/api/hls-segment/")) {
      return handleLazySegment(url, env);
    } else if (url.pathname.startsWith("/api/hls/")) {
      return handleGetHLS(url, env);
    }

    return new Response("Not Found - Video Streaming Worker", {
      status: 404,
    });
  },
};

/**
 * Get HLS files (manifests and segments) from R2
 * For .m3u8 manifests: rewrites with pre-signed URLs for AirPlay support
 * For .ts segments: serves directly from R2
 */
async function handleGetHLS(url: URL, env: VideoStreamingEnv): Promise<Response> {
  // URL format: /api/hls/{videoKey}/{filename}?token=...
  const pathParts = url.pathname.replace("/api/hls/", "").split("/");
  const token = url.searchParams.get("token"); // Auth token for iOS Safari

  if (pathParts.length < 2) {
    return new Response("Invalid HLS path", {
      status: 400,
    });
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
      return new Response("HLS file not found", {
        status: 404,
      });
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

      return new Response(manifestStream, { headers });
    }

    // For .m3u8 variant playlists when pre-signing is disabled:
    // Rewrite segment URLs to include token for iOS Safari authentication
    // (When pre-signing is enabled, segments use direct R2 URLs and bypass worker entirely)
    if (filename.endsWith(".m3u8") && !isVideoSigningEnabled(env) && token) {
      const manifestContent = await object.text();
      // Rewrite relative segment URLs to include the token query parameter
      // This ensures iOS Safari can authenticate when fetching .ts segments through the worker
      const rewrittenManifest = manifestContent.replace(
        /^([^#\n][^\n]*\.ts)$/gm,
        `$1?token=${encodeURIComponent(token)}`
      );

      headers.set("Content-Type", "application/vnd.apple.mpegurl");
      headers.set("Cache-Control", "private, max-age=3600"); // Private cache since it contains token

      return new Response(rewrittenManifest, { headers });
    }

    // For non-manifest files or when no token provided, serve directly
    headers.set("Cache-Control", "public, max-age=2592000"); // Cache for 30 days
    headers.set("etag", object.httpEtag);

    return new Response(object.body, { headers });
  } catch {
    return new Response("Failed to retrieve HLS file", {
      status: 500,
    });
  }
}
