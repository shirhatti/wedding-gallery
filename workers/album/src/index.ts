/**
 * Wedding Photo Album Uploader
 * Mobile-optimized photo sharing for wedding guests
 */

import htmlContent from "./index.html";

interface Env {
  PHOTOS_BUCKET: R2Bucket;
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

        // Generate unique filename
        const timestamp = Date.now();
        const fileName = `${timestamp}-${file.name}`;

        // Upload to R2 bucket
        await env.PHOTOS_BUCKET.put(fileName, file, {
          httpMetadata: {
            contentType: file.type,
          },
          customMetadata: {
            uploadedAt: new Date().toISOString(),
            originalName: file.name,
            fileType: isVideo ? "video" : "image",
          },
        });

        return new Response(JSON.stringify({
          success: true,
          fileName: fileName,
          fileType: isVideo ? "video" : "image"
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
