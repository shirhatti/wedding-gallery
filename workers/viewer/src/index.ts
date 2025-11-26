import { handleGetFile } from "./handlers/media";
import { signR2Url, getSigningConfig } from "@wedding-gallery/shared-video-lib";
import { validateAuthToken, getAuthCookie } from "@wedding-gallery/auth";
import { createPrismaClient } from "./lib/prisma";

interface Env {
  R2_BUCKET: R2Bucket;  // Private bucket only
  DB: D1Database;
  CACHE_VERSION: KVNamespace;
  GALLERY_PASSWORD?: string; // Simple password for gallery access
  AUTH_SECRET?: string; // Secret used to sign auth cookie
  DISABLE_AUTH?: string; // Disable auth entirely (for local dev - set to "true")
  // R2 signing credentials (optional, for private bucket pre-signed URLs)
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_REGION?: string;
  R2_BUCKET_NAME?: string;
  R2_ACCOUNT_ID?: string;
  ENABLE_PRESIGNED_URLS?: string; // Explicitly enable pre-signed URLs (set to "true")
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);

      // Require a strong AUTH_SECRET when password protection is enabled
      if (env.GALLERY_PASSWORD && !env.AUTH_SECRET) {
        throw new Error("AUTH_SECRET must be configured when GALLERY_PASSWORD is set");
      }

      // Cache version endpoint (public, no auth required)
      if (url.pathname === "/api/cache-version") {
        const version = await env.CACHE_VERSION.get("thumbnail_version") || Date.now().toString();
        return new Response(JSON.stringify({ version }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache"
          }
        });
      }

      // Route handling - /api/media (private only, auth required)
      if (url.pathname === "/api/media") {
        if (env.DISABLE_AUTH !== "true") {
          if (!env.GALLERY_PASSWORD || !env.AUTH_SECRET) {
            throw new Error("Auth is enabled but GALLERY_PASSWORD or AUTH_SECRET is not configured");
          }

          const authValue = getAuthCookie(request);

          // Extract audience
          let audience = request.headers.get("Origin");
          if (!audience) {
            const referer = request.headers.get("Referer");
            if (referer) {
              try {
                const refererUrl = new URL(referer);
                audience = refererUrl.origin;
              } catch {}
            }
          }
          audience = audience || url.origin;

          const valid = await validateAuthToken(
            {
              secret: env.AUTH_SECRET,
              cacheVersion: env.CACHE_VERSION,
              disableAuth: false
            },
            audience,
            authValue
          );

          if (!valid) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
              status: 401,
              headers: {
                "Content-Type": "application/json",
              }
            });
          }
        }

        return handleListMedia(env);
      }

      // File and thumbnail routes - require auth (private only)
      if (env.DISABLE_AUTH !== "true" && (url.pathname.startsWith("/api/file/") || url.pathname.startsWith("/api/thumbnail/"))) {
        if (!env.GALLERY_PASSWORD || !env.AUTH_SECRET) {
          throw new Error("Auth is enabled but GALLERY_PASSWORD or AUTH_SECRET is not configured");
        }

        const authValue = getAuthCookie(request);

        // Extract audience
        let audience = request.headers.get("Origin");
        if (!audience) {
          const referer = request.headers.get("Referer");
          if (referer) {
            try {
              const refererUrl = new URL(referer);
              audience = refererUrl.origin;
            } catch {}
          }
        }
        audience = audience || url.origin;

        const valid = await validateAuthToken(
          {
            secret: env.AUTH_SECRET,
            cacheVersion: env.CACHE_VERSION,
            disableAuth: false
          },
          audience,
          authValue
        );

        if (!valid) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: {
              "Content-Type": "application/json",
            }
          });
        }
      }

      if (url.pathname.startsWith("/api/file/")) {
        return handleGetFile(url, env, request);
      } else if (url.pathname.startsWith("/api/thumbnail/")) {
        return handleGetThumbnail(url, env, request);
      }

      return new Response("Not Found", { status: 404 });
    },
  };

  // List all media files from D1 database using Prisma (private only)
  async function handleListMedia(env: Env): Promise<Response> {
    // Initialize Prisma Client with D1 adapter
    const prisma = createPrismaClient(env.DB);

    try {
      // Query all media from private bucket
      const mediaResults = await prisma.media.findMany({
        select: {
          key: true,
          filename: true,
          type: true,
          size: true,
          uploadedAt: true,
          dateTaken: true,
          cameraMake: true,
          cameraModel: true,
          width: true,
          height: true,
        },
        orderBy: [
          { dateTaken: "asc" },
          { uploadedAt: "asc" }
        ],
      });

      interface MediaRow {
        key: string;
        filename: string;
        type: string;
        size: number | null;
        uploadedAt: string | null;
        dateTaken: string | null;
        cameraMake: string | null;
        cameraModel: string | null;
        width: number | null;
        height: number | null;
      }

      // Only generate pre-signed URLs when explicitly enabled
      // Default to OFF to avoid performance regression in legacy viewer
      const usePresignedUrls =
        env.ENABLE_PRESIGNED_URLS === "true" &&
        env.R2_ACCESS_KEY_ID &&
        env.R2_SECRET_ACCESS_KEY;
      const signingConfig = usePresignedUrls ? getSigningConfig(env) : null;

      interface MediaItemResponse {
        key: string;
        name: string;
        size: number;
        type: string;
        uploadedAt: string;
        dateTaken: string | null;
        cameraMake: string | null;
        cameraModel: string | null;
        width?: number;
        height?: number;
        urls?: {
          thumbnailMedium: string;
          original: string;
        };
      }

      const mediaPromises = mediaResults.map(async (row) => {
        const mediaItem: MediaItemResponse = {
          key: row.key,
          name: row.filename,
          size: row.size ?? 0,
          type: row.type,
          uploadedAt: row.uploadedAt ?? "",
          dateTaken: row.dateTaken,
          cameraMake: row.cameraMake,
          cameraModel: row.cameraModel,
        };

        // Add dimensions if available
        if (row.width && row.height) {
          mediaItem.width = row.width;
          mediaItem.height = row.height;
        }

        // Add pre-signed URLs if signing is configured
        if (signingConfig) {
          // Thumbnails are stored in thumbnails/medium/{key}
          const thumbnailKey = `thumbnails/medium/${row.key}`;

          mediaItem.urls = {
            thumbnailMedium: await signR2Url(signingConfig, thumbnailKey, 1800), // 30 min
            original: await signR2Url(signingConfig, row.key, 1800), // 30 min
          };
        }

        return mediaItem;
      });

      const media = await Promise.all(mediaPromises);

      return new Response(JSON.stringify({ media }), {
        headers: {
          "Content-Type": "application/json",
        },
      });
    } catch (error) {
      console.error("Failed to list media:", error);
      return new Response(JSON.stringify({ error: "Failed to list media" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  }

  // Get thumbnail from R2
  async function handleGetThumbnail(url: URL, env: Env, request: Request): Promise<Response> {
    const key = decodeURIComponent(url.pathname.replace("/api/thumbnail/", ""));
    const size = url.searchParams.get("size") || "medium";

    try {
      // Thumbnails are stored in thumbnails/{size}/{key}
      const sizeMap: Record<string, string> = {
        small: "thumbnails/small",
        medium: "thumbnails/medium",
        large: "thumbnails/large"
      };
      const prefix = sizeMap[size] || sizeMap.medium;
      const thumbnailKey = `${prefix}/${key}`;

      // Check If-None-Match for ETag validation - use HEAD request for efficiency
      const ifNoneMatch = request.headers.get("If-None-Match");

      // First, get just the metadata with HEAD
      const head = await env.R2_BUCKET.head(thumbnailKey);

      if (!head) {
        return new Response("Thumbnail not found", { status: 404 });
      }

      // Return 304 if ETag matches (avoids fetching body)
      if (ifNoneMatch && ifNoneMatch === head.httpEtag) {
        return new Response(null, {
          status: 304,
          headers: {
            "etag": head.httpEtag,
            "Cache-Control": "public, max-age=2592000"
          }
        });
      }

      // ETag doesn't match or not provided, fetch the full object
      const object = await env.R2_BUCKET.get(thumbnailKey);

      if (!object) {
        return new Response("Thumbnail not found", { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Cache-Control", "public, max-age=2592000"); // Cache for 30 days
      headers.set("etag", object.httpEtag);

      return new Response(object.body, { headers });
    } catch {
      return new Response("Failed to retrieve thumbnail", {
        status: 500,
      });
    }
  }

