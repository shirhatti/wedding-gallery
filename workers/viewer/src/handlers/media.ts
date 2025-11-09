// Media file handler with range support for video streaming
const MAX_RANGE_SIZE = 50 * 1024 * 1024; // 50MB cap to prevent abuse

interface Env {
  R2_BUCKET: R2Bucket;
}

/**
 * Validates that a path component doesn't contain path traversal attempts.
 * Prevents accessing files outside intended directories.
 */
function isSafePath(pathComponent: string): boolean {
  if (!pathComponent || typeof pathComponent !== "string") {
    return false;
  }

  // Reject any path containing:
  // - ".." (parent directory traversal)
  // - Absolute paths (starting with /)
  // - Null bytes
  // - Backslashes (Windows path separators)
  if (pathComponent.includes("..") ||
      pathComponent.startsWith("/") ||
      pathComponent.includes("\0") ||
      pathComponent.includes("\\")) {
    return false;
  }

  return true;
}

export async function handleGetFile(url: URL, env: Env, corsHeaders: Record<string, string>, request: Request): Promise<Response> {
  const key = decodeURIComponent(url.pathname.replace("/api/file/", ""));

  // Validate key to prevent path traversal
  if (!isSafePath(key)) {
    console.error(`Path traversal attempt in file request: ${key}`);
    return new Response("Invalid file path", {
      status: 400,
      headers: corsHeaders
    });
  }

  try {
    // Check if this is a range request (for video streaming)
    const range = request.headers.get("range");
    
    if (range) {
      // Handle range request for video streaming efficiently using R2 range
      const match = range.match(/^bytes=(\d+)-(\d+)?$/);
      if (!match) {
        return new Response("Invalid Range: format must be bytes=start[-end]", { status: 416 });
      }
      const start = Number(match[1]);
      const endHeader = match[2] !== undefined ? Number(match[2]) : undefined;
      if (!Number.isFinite(start) || start < 0 || (endHeader !== undefined && (!Number.isFinite(endHeader) || endHeader < start))) {
        return new Response("Invalid Range: invalid start/end", { status: 416 });
      }

      // Range size limits to prevent abuse
      const requestedLength = endHeader !== undefined ? (endHeader - start + 1) : undefined;
      if (requestedLength !== undefined && requestedLength > MAX_RANGE_SIZE) {
        return new Response("Invalid Range: requested length too large", { status: 416 });
      }

      // Request only the requested range from R2
      const rangeOpts = endHeader !== undefined
        ? { offset: start, length: requestedLength }
        : { offset: start };
      const object = await env.R2_BUCKET.get(key, { range: rangeOpts });
      if (!object) {
        return new Response("File not found", { status: 404 });
      }

      const totalSize = object.size as number | undefined;
      if (typeof totalSize !== "number") {
        // Fallback: stream without range metadata
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("Accept-Ranges", "bytes");
        Object.keys(corsHeaders).forEach(key => headers.set(key, corsHeaders[key]));
        return new Response(object.body, { status: 206, headers });
      }

      if (start >= totalSize) {
        return new Response("Invalid Range: start exceeds file size", { status: 416 });
      }

      const end = endHeader !== undefined ? Math.min(endHeader, totalSize - 1) : totalSize - 1;
      const contentLength = end - start + 1;

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Content-Range", `bytes ${start}-${end}/${totalSize}`);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Content-Length", String(contentLength));
      headers.set("Content-Type", object.httpMetadata?.contentType || "video/mp4");
      Object.keys(corsHeaders).forEach(key => headers.set(key, corsHeaders[key]));

      return new Response(object.body, {
        status: 206,
        headers,
      });
    } else {
      // Regular request (for images and initial video load)
      const object = await env.R2_BUCKET.get(key);
      
      if (!object) {
        return new Response("File not found", { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("etag", object.httpEtag);
      headers.set("Cache-Control", "public, max-age=86400"); // Cache for 24 hours
      headers.set("Accept-Ranges", "bytes"); // Enable range requests
      Object.keys(corsHeaders).forEach(key => headers.set(key, corsHeaders[key]));

      return new Response(object.body, { headers });
    }
  } catch (error) {
    console.error("Failed to retrieve file:", error);
    return new Response("Failed to retrieve file", {
      status: 500,
      headers: corsHeaders
    });
  }
}
