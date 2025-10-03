/**
 * Helper worker to fetch images from R2
 */

import * as exifr from 'exifr';

interface Env {
  PHOTOS_BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/list') {
      // List all objects
      const listed = await env.PHOTOS_BUCKET.list({ limit: 1000 });
      return new Response(JSON.stringify(listed.objects), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/get') {
      // Get specific object (first 64KB for EXIF)
      const key = url.searchParams.get('key');
      if (!key) {
        return new Response('Missing key parameter', { status: 400 });
      }

      const object = await env.PHOTOS_BUCKET.get(key, {
        range: { offset: 0, length: 65536 }
      });

      if (!object) {
        return new Response('Not found', { status: 404 });
      }

      const buffer = await object.arrayBuffer();

      // Extract EXIF
      let exif = null;
      try {
        exif = await exifr.parse(buffer, {
          pick: ['DateTimeOriginal', 'Make', 'Model', 'LensModel',
                 'FocalLength', 'FNumber', 'ExposureTime', 'ISO',
                 'latitude', 'longitude', 'GPSAltitude']
        });
      } catch (e) {
        // No EXIF
      }

      return new Response(JSON.stringify({
        key,
        exif
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (url.pathname === '/get-full') {
      // Get full object for thumbnail generation
      const key = url.searchParams.get('key');
      if (!key) {
        return new Response('Missing key parameter', { status: 400 });
      }

      const object = await env.PHOTOS_BUCKET.get(key);

      if (!object) {
        return new Response('Not found', { status: 404 });
      }

      return new Response(object.body, {
        headers: { 'Content-Type': object.httpMetadata?.contentType || 'application/octet-stream' }
      });
    }

    if (url.pathname === '/upload' && request.method === 'POST') {
      // Upload object to R2
      const body = await request.json() as { key: string; data: string; contentType?: string };

      if (!body.key || !body.data) {
        return new Response('Missing key or data', { status: 400 });
      }

      // Convert base64 to buffer
      const buffer = Uint8Array.from(atob(body.data), c => c.charCodeAt(0));

      await env.PHOTOS_BUCKET.put(body.key, buffer, {
        httpMetadata: {
          contentType: body.contentType || 'image/webp'
        }
      });

      return new Response('OK');
    }

    if (url.pathname === '/list-thumbnails') {
      // List all thumbnails with a specific prefix
      const prefix = url.searchParams.get('prefix') || 'thumbnails/medium/';
      const allKeys: string[] = [];
      let cursor: string | undefined;

      do {
        const result = await env.PHOTOS_BUCKET.list({
          prefix,
          cursor,
          limit: 1000
        });

        allKeys.push(...result.objects.map(obj => obj.key));
        cursor = result.truncated ? result.cursor : undefined;
      } while (cursor);

      return new Response(JSON.stringify({ keys: allKeys }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response('Not found', { status: 404 });
  }
};

