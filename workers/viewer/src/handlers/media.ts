// Media file handler with range support for video streaming
const MAX_RANGE_SIZE = 50 * 1024 * 1024; // 50MB cap to prevent abuse

interface Env {
  R2_BUCKET: R2Bucket;
}

export async function handleGetFile(url: URL, env: Env, request: Request): Promise<Response> {
  const key = decodeURIComponent(url.pathname.replace("/api/file/", ""));
  
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

      return new Response(object.body, { headers });
    }
  } catch (_error) {
    return new Response("Failed to retrieve file", {
      status: 500,
    });
  }
}
