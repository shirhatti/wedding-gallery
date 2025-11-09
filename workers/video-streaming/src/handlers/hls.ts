import { sanitizeVideoKey } from "../lib/security";
import { createPrismaClient } from "../lib/prisma";
import type { VideoStreamingEnv } from "../types";

/**
 * Handles HLS master playlist requests
 * Master playlist contains variant references (360p.m3u8, 720p.m3u8, etc.)
 * These are rewritten to worker URLs (not presigned) for fast response
 * Uses industry-standard m3u8-parser for robust playlist handling
 */
export async function handleHLSPlaylist(request: Request, env: VideoStreamingEnv) {
  try {
    const url = new URL(request.url);
    const rawVideoKey = url.searchParams.get("key");
    const token = url.searchParams.get("token"); // Auth token for iOS Safari

    if (!rawVideoKey) {
      return new Response(JSON.stringify({ error: "Missing key parameter" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    // Sanitize video key to prevent path traversal attacks
    const videoKey = sanitizeVideoKey(rawVideoKey);

    // Check manifest cache first (fastest path - single KV read)
    // Since hls_qualities never changes, we don't need time-based cache invalidation
    const manifestCacheKey = `manifest:master:v4:${videoKey}`;
    const cachedManifest = await env.VIDEO_CACHE.get(manifestCacheKey);
    if (cachedManifest) {
      return new Response(cachedManifest, {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
          "Cache-Control": "public, max-age=31536000, immutable",
          "X-Cache": "HIT",
        },
      });
    }

    // Cache miss - need to fetch quality levels
    // First check KV cache for hls_qualities (avoids DB query)
    const qualitiesCacheKey = `qualities:${videoKey}`;
    let qualityLevels: string[];

    const cachedQualities = await env.VIDEO_CACHE.get(qualitiesCacheKey);
    if (cachedQualities) {
      qualityLevels = JSON.parse(cachedQualities);
    } else {
      // Cache miss - query database using Prisma
      const prisma = createPrismaClient(env.DB);

      const mediaEntry = await prisma.media.findUnique({
        where: { key: videoKey },
        select: { hlsQualities: true }
      });

      if (!mediaEntry || !mediaEntry.hlsQualities) {
        return new Response(JSON.stringify({ error: "HLS variants not found in database" }), {
          status: 404,
          headers: {
            "Content-Type": "application/json",
          },
        });
      }

      // Parse quality levels from database (stored as JSON array like ["1080p", "360p"])
      qualityLevels = JSON.parse(mediaEntry.hlsQualities);

      // Cache quality levels indefinitely (they never change)
      await env.VIDEO_CACHE.put(qualitiesCacheKey, JSON.stringify(qualityLevels));
    }

    const variantFiles = qualityLevels.map(q => `${q}.m3u8`);

    if (variantFiles.length === 0) {
      return new Response(JSON.stringify({ error: "No HLS variants available" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    // Quality preset metadata (matches scripts/lib/hls-converter.mjs)
    const qualityMetadata: Record<string, { bandwidth: number; resolution: string }> = {
      "1080p.m3u8": { bandwidth: 5128000, resolution: "1920x1080" },
      "720p.m3u8": { bandwidth: 2928000, resolution: "1280x720" },
      "480p.m3u8": { bandwidth: 1496000, resolution: "854x480" },
      "360p.m3u8": { bandwidth: 896000, resolution: "640x360" },
    };

    // Helper function to estimate metadata for non-standard resolutions
    function estimateMetadata(qualityName: string): { bandwidth: number; resolution: string } {
      // Extract height from quality name (e.g., "540p.m3u8" -> 540)
      const heightMatch = qualityName.match(/(\d+)p\.m3u8$/);
      if (!heightMatch) {
        // Fallback
        return { bandwidth: 1000000, resolution: "640x360" };
      }

      const height = parseInt(heightMatch[1]);
      // Assume 16:9 aspect ratio, ensure even width
      const width = Math.round(height * 16 / 9);
      const evenWidth = width % 2 === 0 ? width : width - 1;

      // Estimate bandwidth based on resolution tier
      let bandwidth;
      if (height >= 1080) {
        bandwidth = 5128000;
      } else if (height >= 720) {
        bandwidth = 2928000;
      } else if (height >= 480) {
        bandwidth = 1496000;
      } else {
        bandwidth = 896000;
      }

      return {
        bandwidth,
        resolution: `${evenWidth}x${height}`
      };
    }

    // Build master playlist with only verified available variants
    const masterLines = ["#EXTM3U", "#EXT-X-VERSION:3"];

    for (const variantFile of variantFiles.sort().reverse()) {
      const metadata = qualityMetadata[variantFile] || estimateMetadata(variantFile);
      // Append token to variant URLs for iOS Safari authentication
      let variantUrl = `/api/hls/${videoKey}/${variantFile}`;
      if (token) {
        variantUrl += `?token=${encodeURIComponent(token)}`;
      }
      masterLines.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${metadata.bandwidth},RESOLUTION=${metadata.resolution}`,
        variantUrl
      );
    }

    const masterPlaylist = masterLines.join("\n");

    // Cache the generated manifest indefinitely (hls_qualities never changes)
    await env.VIDEO_CACHE.put(manifestCacheKey, masterPlaylist);

    return new Response(masterPlaylist, {
      headers: {
        "Content-Type": "application/vnd.apple.mpegurl",
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Cache": "MISS",
      },
    });
  } catch (error) {
    console.error("HLS playlist error:", error);
    return new Response(JSON.stringify({ error: "Failed to generate playlist" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}
