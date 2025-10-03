import { handleHomePage } from "./handlers/home";
import { handleGetFile } from "./handlers/media";

interface Env {
  R2_BUCKET: R2Bucket;
  DB: D1Database;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);

      // CORS headers
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Range",
        "Accept-Ranges": "bytes",
      };

      // Handle CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // Route handling
      if (url.pathname === "/") {
        return handleHomePage();
      } else if (url.pathname === "/api/media") {
        return handleListMedia(env, corsHeaders);
      } else if (url.pathname.startsWith("/api/file/")) {
        return handleGetFile(url, env, corsHeaders, request);
      } else if (url.pathname.startsWith("/api/thumbnail/")) {
        return handleGetThumbnail(url, env, corsHeaders);
      }

      return new Response("Not Found", { status: 404 });
    },
  };

  // List all media files from D1 database
  async function handleListMedia(env: Env, corsHeaders: Record<string, string>): Promise<Response> {
    try {
      const result = await env.DB.prepare(`
        SELECT key, filename, type, size, uploaded_at, date_taken, camera_make, camera_model
        FROM media
        ORDER BY COALESCE(date_taken, uploaded_at) ASC
        LIMIT 1000
      `).all();

      interface MediaRow {
        key: string;
        filename: string;
        type: string;
        size: number;
        uploaded_at: string;
        date_taken: string | null;
        camera_make: string | null;
        camera_model: string | null;
      }

      const media = result.results.map((row) => {
        const r = row as MediaRow;
        return {
          key: r.key,
          name: r.filename,
          size: r.size,
          type: r.type,
          uploaded: r.uploaded_at,
          dateTaken: r.date_taken,
          cameraMake: r.camera_make,
          cameraModel: r.camera_model,
        };
      });

      return new Response(JSON.stringify({ media }), {
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        },
      });
    } catch (_error) {
      return new Response(JSON.stringify({ error: "Failed to list media" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders
        },
      });
    }
  }

  // Get thumbnail from R2
  async function handleGetThumbnail(url: URL, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
    const key = decodeURIComponent(url.pathname.replace("/api/thumbnail/", ""));
    const size = url.searchParams.get("size") || "medium";

    try {
      // Map size to R2 path
      const sizeMap: Record<string, string> = {
        small: "thumbnails/small",
        medium: "thumbnails/medium",
        large: "thumbnails/large"
      };

      const prefix = sizeMap[size] || sizeMap.medium;
      const thumbnailKey = `${prefix}/${key}`;

      const object = await env.R2_BUCKET.get(thumbnailKey);

      if (!object) {
        return new Response("Thumbnail not found", { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Cache-Control", "public, max-age=2592000"); // Cache for 30 days
      headers.set("etag", object.httpEtag);
      Object.keys(corsHeaders).forEach(key => headers.set(key, corsHeaders[key]));

      return new Response(object.body, { headers });
    } catch (_error) {
      return new Response("Failed to retrieve thumbnail", {
        status: 500,
        headers: corsHeaders
      });
    }
  }
