import { handleHomePage } from "./handlers/home";
import { handleGetFile } from "./handlers/media";

interface Env {
  R2_BUCKET: R2Bucket;
  DB: D1Database;
  CACHE_VERSION: KVNamespace;
  GALLERY_PASSWORD?: string; // Simple password for gallery access
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
      const url = new URL(request.url);

      // CORS headers
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Range, Cookie",
        "Accept-Ranges": "bytes",
      };

      // Handle CORS preflight
      if (request.method === "OPTIONS") {
        return new Response(null, { headers: corsHeaders });
      }

      // Cache version endpoint (public, no auth required)
      if (url.pathname === "/api/cache-version") {
        const version = await env.CACHE_VERSION.get("thumbnail_version") || Date.now().toString();
        return new Response(JSON.stringify({ version }), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Cache-Control": "no-cache"
          }
        });
      }

      // Login page and authentication
      if (url.pathname === "/login") {
        if (request.method === "POST") {
          const formData = await request.formData();
          const password = formData.get("password")?.toString() || "";

          if (env.GALLERY_PASSWORD && password === env.GALLERY_PASSWORD) {
            const headers = new Headers();
            headers.set("Set-Cookie", `gallery_auth=${env.GALLERY_PASSWORD}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`);
            headers.set("Location", "/");
            return new Response(null, { status: 302, headers });
          }

          return new Response(getLoginPage(true), {
            headers: { "Content-Type": "text/html" }
          });
        }
        return new Response(getLoginPage(false), {
          headers: { "Content-Type": "text/html" }
        });
      }

      // Check authentication if password is set
      if (env.GALLERY_PASSWORD) {
        const cookies = request.headers.get("Cookie") || "";
        const authCookie = cookies.split(";").find(c => c.trim().startsWith("gallery_auth="));
        const authValue = authCookie?.split("=")[1];

        if (authValue !== env.GALLERY_PASSWORD) {
          return Response.redirect(url.origin + "/login", 302);
        }
      }

      // Route handling
      if (url.pathname === "/") {
        return handleHomePage();
      } else if (url.pathname === "/api/media") {
        return handleListMedia(env, corsHeaders);
      } else if (url.pathname.startsWith("/api/file/")) {
        return handleGetFile(url, env, corsHeaders, request);
      } else if (url.pathname.startsWith("/api/thumbnail/")) {
        return handleGetThumbnail(url, env, corsHeaders, request);
      } else if (url.pathname.startsWith("/api/hls/")) {
        return handleGetHLS(url, env, corsHeaders);
      }

      return new Response("Not Found", { status: 404 });
    },
  };

  function getLoginPage(error: boolean): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Gallery Login</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }

        .login-container {
            background: white;
            padding: 2rem;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.1);
            width: 90%;
            max-width: 400px;
        }

        .logo {
            text-align: center;
            margin-bottom: 2rem;
        }

        .logo img {
            height: 60px;
            width: auto;
        }

        h1 {
            margin: 0 0 0.5rem 0;
            font-size: 1.75rem;
            color: #333;
            text-align: center;
        }

        p {
            margin: 0 0 2rem 0;
            color: #666;
            text-align: center;
        }

        .error {
            background: #fee;
            border: 1px solid #fcc;
            color: #c33;
            padding: 0.75rem;
            border-radius: 6px;
            margin-bottom: 1rem;
            text-align: center;
        }

        input[type="password"] {
            width: 100%;
            padding: 0.875rem;
            border: 2px solid #e1e4e8;
            border-radius: 6px;
            font-size: 1rem;
            box-sizing: border-box;
            transition: border-color 0.2s;
        }

        input[type="password"]:focus {
            outline: none;
            border-color: #667eea;
        }

        button {
            width: 100%;
            padding: 0.875rem;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            margin-top: 1rem;
            transition: opacity 0.2s;
        }

        button:hover {
            opacity: 0.9;
        }
    </style>
</head>
<body>
    <div class="login-container">
        <div class="logo">
            <img src="https://assets.shirhatti.com/weddinglogo.svg" alt="Wedding Logo">
        </div>
        <h1>Welcome</h1>
        <p>Enter the password to view the gallery</p>
        ${error ? "<div class=\"error\">Invalid password. Please try again.</div>" : ""}
        <form method="POST">
            <input type="password" name="password" placeholder="Enter password" required autofocus>
            <button type="submit">Access Gallery</button>
        </form>
    </div>
</body>
</html>`;
  }

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
  async function handleGetThumbnail(url: URL, env: Env, corsHeaders: Record<string, string>, request: Request): Promise<Response> {
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
      Object.keys(corsHeaders).forEach(key => headers.set(key, corsHeaders[key]));

      return new Response(object.body, { headers });
    } catch (_error) {
      return new Response("Failed to retrieve thumbnail", {
        status: 500,
        headers: corsHeaders
      });
    }
  }

  // Get HLS files (manifests and segments) from R2
  async function handleGetHLS(url: URL, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
    // URL format: /api/hls/{videoKey}/{filename}
    const pathParts = url.pathname.replace("/api/hls/", "").split("/");

    if (pathParts.length < 2) {
      return new Response("Invalid HLS path", { status: 400 });
    }

    const videoKey = decodeURIComponent(pathParts.slice(0, -1).join("/"));
    const filename = decodeURIComponent(pathParts[pathParts.length - 1]);
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

      headers.set("Cache-Control", "public, max-age=2592000"); // Cache for 30 days
      headers.set("etag", object.httpEtag);
      Object.keys(corsHeaders).forEach(key => headers.set(key, corsHeaders[key]));

      return new Response(object.body, { headers });
    } catch (_error) {
      return new Response("Failed to retrieve HLS file", {
        status: 500,
        headers: corsHeaders
      });
    }
  }
