import { handleHomePage } from "./handlers/home";
import { handleGetFile } from "./handlers/media";
import { signR2Url, getSigningConfig } from "@wedding-gallery/shared-video-lib";
import { createAuthToken, validateAuthToken, isValidReturnTo, getAuthCookie } from "@wedding-gallery/auth";

interface Env {
  R2_BUCKET: R2Bucket;
  DB: D1Database;
  CACHE_VERSION: KVNamespace;
  GALLERY_PASSWORD?: string; // Simple password for gallery access
  AUTH_SECRET?: string; // Secret used to sign auth cookie
  // R2 signing credentials (optional)
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

      // Login page and authentication
      if (url.pathname === "/login") {
        if (request.method === "POST") {
          const formData = await request.formData();
          const password = formData.get("password")?.toString() || "";
          const returnTo = formData.get("returnTo")?.toString() || "/";
          const validReturnTo = isValidReturnTo(returnTo, "jessandsourabh.pages.dev") ? returnTo : "/";

          if (env.GALLERY_PASSWORD && password === env.GALLERY_PASSWORD) {
            const headers = new Headers();
            // Use the frontend's origin as the audience for cross-worker auth
            // Try Origin header first, then extract from Referer, finally fallback to url.origin
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

            const token = await createAuthToken(
              { secret: env.AUTH_SECRET!, cacheVersion: env.CACHE_VERSION },
              audience
            );

            // Only set Secure flag for HTTPS (production), not for local HTTP development
            const isSecure = url.protocol === "https:";
            const secureCookie = isSecure ? "; Secure" : "";
            // For localhost (HTTP), use SameSite=Lax. For production (HTTPS), use SameSite=None
            const sameSite = isSecure ? "SameSite=None" : "SameSite=Lax";
            headers.set("Set-Cookie", `gallery_auth=${token}; Path=/; HttpOnly${secureCookie}; ${sameSite}; Max-Age=2592000`);
            headers.set("Location", validReturnTo);
            return new Response(null, { status: 302, headers });
          }

          return new Response(getLoginPage(true, validReturnTo), {
            headers: { "Content-Type": "text/html" }
          });
        }
        const returnTo = url.searchParams.get("returnTo") || "/";
        const validReturnTo = isValidReturnTo(returnTo, "jessandsourabh.pages.dev") ? returnTo : "/";
        return new Response(getLoginPage(false, validReturnTo), {
          headers: { "Content-Type": "text/html" }
        });
      }

      // Check authentication if password is set
      if (env.GALLERY_PASSWORD) {
        const authValue = getAuthCookie(request);

        // Extract audience the same way we do during login
        // Try Origin header first, then Referer, finally fallback to url.origin
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
          { secret: env.AUTH_SECRET!, cacheVersion: env.CACHE_VERSION },
          audience,
          authValue
        );

        if (!valid) {
          // For API requests, return 401 so client can handle redirect
          if (url.pathname.startsWith("/api/")) {
            return new Response(JSON.stringify({ error: "Unauthorized" }), {
              status: 401,
              headers: {
                "Content-Type": "application/json",
              }
            });
          }
          // For page requests, redirect to login with returnTo parameter
          const loginUrl = new URL("/login", url.origin);
          loginUrl.searchParams.set("returnTo", url.pathname + url.search);
          return Response.redirect(loginUrl.toString(), 302);
        }
      }

      // Route handling - media and auth only (video streaming handled by separate worker)
      if (url.pathname === "/") {
        return handleHomePage();
      } else if (url.pathname === "/api/media") {
        return handleListMedia(env);
      } else if (url.pathname.startsWith("/api/file/")) {
        return handleGetFile(url, env, request);
      } else if (url.pathname.startsWith("/api/thumbnail/")) {
        return handleGetThumbnail(url, env, request);
      }

      return new Response("Not Found", { status: 404 });
    },
  };

  function escapeHtml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getLoginPage(error: boolean, returnTo: string = "/"): string {
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
            <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">
            <input type="password" name="password" placeholder="Enter password" required autofocus>
            <button type="submit">Access Gallery</button>
        </form>
    </div>
</body>
</html>`;
  }

  // List all media files from D1 database
  async function handleListMedia(env: Env): Promise<Response> {
    try {
      const result = await env.DB.prepare(`
        SELECT key, filename, type, size, uploaded_at, date_taken, camera_make, camera_model
        FROM media
        ORDER BY COALESCE(date_taken, uploaded_at) ASC
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
        urls?: {
          thumbnailMedium: string;
          original: string;
        };
      }

      const mediaPromises = result.results.map(async (row) => {
        const r = row as MediaRow;
        const mediaItem: MediaItemResponse = {
          key: r.key,
          name: r.filename,
          size: r.size,
          type: r.type,
          uploadedAt: r.uploaded_at,
          dateTaken: r.date_taken,
          cameraMake: r.camera_make,
          cameraModel: r.camera_model,
        };

        // Add pre-signed URLs if signing is configured
        if (signingConfig) {
          const thumbnailKey = `thumbnails/${r.key.replace(/\.[^.]+$/, "")}_medium.jpg`;

          mediaItem.urls = {
            thumbnailMedium: await signR2Url(signingConfig, thumbnailKey, 1800), // 30 min
            original: await signR2Url(signingConfig, r.key, 1800), // 30 min
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
    }
  }

  // Get thumbnail from R2
  async function handleGetThumbnail(url: URL, env: Env, request: Request): Promise<Response> {
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

      return new Response(object.body, { headers });
    } catch {
      return new Response("Failed to retrieve thumbnail", {
        status: 500,
      });
    }
  }

