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
 * Note: This function loads the entire file into memory. File size is validated
 * before calling this function to prevent memory exhaustion (max 100MB).
 * Using Web Crypto API's native implementation is much faster than streaming
 * with a pure-JS SHA-256 implementation.
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

/**
 * Sanitizes a filename for safe database storage and display.
 * Uses a whitelist approach with Unicode normalization to prevent bypasses.
 *
 * @param filename - The original filename from the client
 * @returns A sanitized filename safe for storage and display
 */
function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== 'string') {
    return 'unknown';
  }

  // Normalize Unicode to prevent bypasses (e.g., different representations of the same character)
  // NFD = Canonical Decomposition - breaks combined characters into base + combining marks
  filename = filename.normalize('NFD');

  // Extract the extension safely
  const lastDotIndex = filename.lastIndexOf('.');
  let baseName = filename;
  let extension = '';

  if (lastDotIndex > 0 && lastDotIndex < filename.length - 1) {
    baseName = filename.substring(0, lastDotIndex);
    extension = filename.substring(lastDotIndex + 1);
  }

  // Whitelist approach: keep only safe characters
  // Allow: alphanumeric, spaces, hyphens, underscores, dots, parentheses, brackets
  // This prevents any path traversal or injection attempts
  baseName = baseName
    .replace(/[^a-zA-Z0-9\s\-_()\[\].]/g, '') // Keep only whitelisted characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/\.+/g, '.') // Collapse multiple dots
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, '') // Remove leading/trailing dots and spaces
    .substring(0, 200); // Limit length

  // Sanitize the extension (allow only alphanumeric)
  extension = extension
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 10)
    .toLowerCase();

  // If the basename is empty after sanitization, use a default
  if (!baseName) {
    baseName = 'upload';
  }

  // Return the sanitized filename with extension
  return extension ? `${baseName}.${extension}` : baseName;
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

        // Validate file size (limit to 100MB to prevent memory issues)
        const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
        if (file.size > MAX_FILE_SIZE) {
          return new Response(
            `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB`,
            { status: 413 } // 413 Payload Too Large
          );
        }

        // Validate file type (images and videos only)
        const isImage = file.type.startsWith("image/");
        const isVideo = file.type.startsWith("video/");

        if (!isImage && !isVideo) {
          return new Response("Only image and video files are allowed", { status: 400 });
        }

        // Get file extension from MIME type - reject unknown types
        const extension = MIME_TO_EXTENSION[file.type.toLowerCase()];
        if (!extension) {
          return new Response(
            `Unsupported file type: ${file.type}. Please upload a common image or video format.`,
            { status: 400 }
          );
        }

        // Generate content-addressable key using SHA-256 hash
        const hash = await hashFile(file);
        const key = `${hash}.${extension}`;

        // Sanitize filename for safe database storage and display
        const sanitizedFilename = sanitizeFilename(file.name);

        const uploadedAt = new Date().toISOString();
        const fileType = isVideo ? "video" : "image";

        // Check if file already exists (deduplication)
        // Note: There's a potential race condition between head() and put()
        // if multiple users upload the same file simultaneously. This is acceptable
        // because R2 put is idempotent - the last write wins with identical content.
        const existing = await env.PHOTOS_BUCKET.head(key);

        if (!existing) {
          try {
            // Upload to R2 bucket only if it doesn't exist
            await env.PHOTOS_BUCKET.put(key, file, {
              httpMetadata: {
                contentType: file.type,
              },
              customMetadata: {
                uploadedAt: uploadedAt,
                originalName: sanitizedFilename,
                fileType: fileType,
              },
            });
          } catch (error) {
            // Differentiate between race conditions and actual failures
            const errorMessage = error instanceof Error ? error.message : String(error);

            // If the error suggests the file now exists (race condition), we can proceed
            // Otherwise, this is a real failure and we should abort
            if (!errorMessage.includes('already exists') && !errorMessage.includes('conflict')) {
              console.error(`R2 upload failed for ${key}:`, error);
              throw new Error('Failed to upload file to storage');
            }

            // Log race condition but continue - another upload succeeded
            console.log(`R2 upload race condition for ${key} - file already exists`);
          }
        }

        // Always insert/update database record to track this upload
        // (multiple people might upload the same photo)
        await env.DB.prepare(`
          INSERT OR REPLACE INTO media (
            key, filename, type, size, uploaded_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
          key,
          sanitizedFilename,
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
