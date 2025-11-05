/**
 * Wedding Photo Album Uploader
 * Mobile-optimized photo sharing for wedding guests
 */

import htmlContent from "./index.html";

interface Env {
  PHOTOS_BUCKET: R2Bucket;
  DB: D1Database;
}

/**
 * Maps MIME types to file extensions for content-addressable storage.
 */
const MIME_TO_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
  'video/x-matroska': 'mkv',
  'video/x-m4v': 'm4v',
};

/**
 * Computes SHA-256 hash of file content for content-addressable storage.
 * This enables automatic deduplication and eliminates filename security concerns.
 *
 * @param file - The file to hash
 * @returns Hex-encoded SHA-256 hash
 */
async function hashFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Serve the HTML page for GET requests
    if (request.method === "GET") {
      return new Response(htmlContent, {
        headers: {
          "Content-Type": "text/html",
        },
      });
    }

    // Handle photo uploads for POST requests
    if (request.method === "POST" && url.pathname === "/upload") {
      try {
        const formData = await request.formData();
        const file = formData.get("files[]") as File | null;

        if (!file) {
          return new Response("No file uploaded", { status: 400 });
        }

        // Validate file type (images and videos only)
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");

        if (!isImage && !isVideo) {
          return new Response("Only image and video files are allowed", { status: 400 });
        }

        // Get file extension from MIME type
        const extension = MIME_TO_EXTENSION[file.type.toLowerCase()] ||
                          (isImage ? 'jpg' : 'mp4');

        // Generate content-addressable key using SHA-256 hash
        const hash = await hashFile(file);
        const key = `${hash}.${extension}`;

        const uploadedAt = new Date().toISOString();
        const fileType = isVideo ? "video" : "image";

        // Check if file already exists (deduplication)
        const existing = await env.PHOTOS_BUCKET.head(key);

        if (!existing) {
          // Upload to R2 bucket only if it doesn't exist
          await env.PHOTOS_BUCKET.put(key, file, {
            httpMetadata: {
              contentType: file.type,
            },
            customMetadata: {
              uploadedAt: uploadedAt,
              originalName: file.name,
              fileType: fileType,
            },
          });
        }

        // Always insert/update database record to track this upload
        // (multiple people might upload the same photo)
        await env.DB.prepare(`
          INSERT OR REPLACE INTO media (
            key, filename, type, size, uploaded_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          key,
          file.name,
          fileType,
          file.size,
          uploadedAt,
          uploadedAt,
          uploadedAt
        ).run();

        // Add to pending_thumbnails queue for processing (if new file)
        if (!existing) {
          await env.DB.prepare(`
            INSERT OR IGNORE INTO pending_thumbnails (key, created_at)
            VALUES (?, ?)
          `).bind(key, uploadedAt).run();
        }

        return new Response(JSON.stringify({
          success: true,
          fileName: key,
          fileType: fileType,
          isDuplicate: existing !== null
        }), {
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        });

      } catch (error) {
        console.error("Upload error:", error);
        return new Response("Upload failed", { status: 500 });
      }
    }

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    return new Response("Not found", { status: 404 });
  },
};
