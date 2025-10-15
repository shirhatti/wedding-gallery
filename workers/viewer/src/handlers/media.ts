// Media file handler with range support for video streaming
export async function handleGetFile(url, env, corsHeaders, request) {
  const key = decodeURIComponent(url.pathname.replace("/api/file/", ""));
  
  try {
    // Check if this is a range request (for video streaming)
    const range = request.headers.get("range");
    
    if (range) {
      // Handle range request for video streaming efficiently using R2 range
      const match = range.match(/^bytes=(\d+)-(\d+)?$/);
      if (!match) {
        return new Response("Invalid Range", { status: 416 });
      }
      const start = Number(match[1]);
      const endHeader = match[2] !== undefined ? Number(match[2]) : undefined;
      if (!Number.isFinite(start) || start < 0 || (endHeader !== undefined && (!Number.isFinite(endHeader) || endHeader < start))) {
        return new Response("Invalid Range", { status: 416 });
      }

      // Request only the requested range from R2
      const length = endHeader !== undefined ? (endHeader - start + 1) : undefined;
      const object = await env.R2_BUCKET.get(key, { range: { offset: start, length } });
      if (!object) {
        return new Response("File not found", { status: 404 });
      }

      const totalSize = object.size as number | undefined;
      if (typeof totalSize !== 'number') {
        // Fallback: stream without range metadata
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("Accept-Ranges", "bytes");
        Object.keys(corsHeaders).forEach(key => headers.set(key, corsHeaders[key]));
        return new Response(object.body, { status: 206, headers });
      }

      if (start >= totalSize) {
        return new Response("Invalid Range", { status: 416 });
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
  } catch (_error) {
    return new Response("Failed to retrieve file", { 
      status: 500,
      headers: corsHeaders 
    });
  }
}
