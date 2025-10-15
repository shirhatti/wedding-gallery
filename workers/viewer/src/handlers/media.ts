// Media file handler with range support for video streaming
export async function handleGetFile(url, env, corsHeaders, request) {
  const key = decodeURIComponent(url.pathname.replace("/api/file/", ""));
  
  try {
    // Check if this is a range request (for video streaming)
    const range = request.headers.get("range");
    
    if (range) {
      // Handle range request for video streaming efficiently using R2 range
      // Parse the Range header conservatively (only start supported)
      const startStr = range.replace(/bytes=/, "").split("-")[0];
      const start = Number(startStr);
      if (Number.isNaN(start) || start < 0) {
        return new Response("Invalid Range", { status: 416 });
      }

      // Request only the range from R2; omit end to stream to end
      const object = await env.R2_BUCKET.get(key, { range: { offset: start } });
      if (!object) {
        return new Response("File not found", { status: 404 });
      }

      // Get full size via HEAD to compute Content-Range and Content-Length
      const head = await env.R2_BUCKET.head(key);
      if (!head) {
        return new Response("File not found", { status: 404 });
      }

      const totalSize = head.size ?? (object.size as number | undefined);
      if (typeof totalSize !== 'number') {
        // Fallback: stream without range metadata
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("Accept-Ranges", "bytes");
        Object.keys(corsHeaders).forEach(key => headers.set(key, corsHeaders[key]));
        return new Response(object.body, { status: 206, headers });
      }

      const end = totalSize - 1;
      const contentLength = end - start + 1;

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Content-Range", `bytes ${start}-${end}/${totalSize}`);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Content-Length", String(contentLength));
      headers.set("Content-Type", head.httpMetadata?.contentType || object.httpMetadata?.contentType || "video/mp4");
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
