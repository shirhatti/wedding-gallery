// Media file handler with range support for video streaming
export async function handleGetFile(url, env, corsHeaders, request) {
  const key = decodeURIComponent(url.pathname.replace('/api/file/', ''));
  
  try {
    // Check if this is a range request (for video streaming)
    const range = request.headers.get('range');
    
    if (range) {
      // Handle range request for video streaming
      const object = await env.R2_BUCKET.get(key);
      
      if (!object) {
        return new Response('File not found', { status: 404 });
      }
      
      const bytes = await object.arrayBuffer();
      const start = Number(range.replace(/bytes=/, '').split('-')[0]);
      const end = bytes.byteLength - 1;
      const contentLength = end - start + 1;
      
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('Content-Range', 'bytes ' + start + '-' + end + '/' + bytes.byteLength);
      headers.set('Accept-Ranges', 'bytes');
      headers.set('Content-Length', contentLength);
      headers.set('Content-Type', object.httpMetadata?.contentType || 'video/mp4');
      Object.keys(corsHeaders).forEach(key => headers.set(key, corsHeaders[key]));
      
      const slicedBytes = bytes.slice(start, end + 1);
      
      return new Response(slicedBytes, {
        status: 206,
        headers,
      });
    } else {
      // Regular request (for images and initial video load)
      const object = await env.R2_BUCKET.get(key);
      
      if (!object) {
        return new Response('File not found', { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      headers.set('Accept-Ranges', 'bytes'); // Enable range requests
      Object.keys(corsHeaders).forEach(key => headers.set(key, corsHeaders[key]));

      return new Response(object.body, { headers });
    }
  } catch (error) {
    return new Response('Failed to retrieve file', { 
      status: 500,
      headers: corsHeaders 
    });
  }
}
