import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index';

describe('AirPlay token generation', () => {
  it('requires auth when GALLERY_PASSWORD set', async () => {
    const env = {
      R2_BUCKET: {} as any,
      DB: {} as any,
      CACHE_VERSION: { get: async () => '1' } as any,
      AIRPLAY_TOKENS: {
        get: async () => null,
        put: async () => {},
      } as any,
      GALLERY_PASSWORD: 'secret',
      AUTH_SECRET: 'super-secret',
    } as any;

    const res = await worker.fetch(new Request('https://example.com/api/generate-airplay-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: 'videos/clip.mov' }),
    }), env);

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://example.com/login');
  });

  it('generates token when authenticated', async () => {
    let storedToken = '';
    let storedData = '';
    
    const env = {
      R2_BUCKET: {} as any,
      DB: {} as any,
      CACHE_VERSION: { get: async () => '1' } as any,
      AIRPLAY_TOKENS: {
        get: async (key: string) => (key === storedToken ? storedData : null),
        put: async (key: string, value: string) => {
          storedToken = key;
          storedData = value;
        },
      } as any,
      GALLERY_PASSWORD: 'secret',
      AUTH_SECRET: 'super-secret',
    } as any;

    const loginReq = new Request('https://example.com/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'password=secret',
    });
    const loginRes = await worker.fetch(loginReq, env);
    expect(loginRes.status).toBe(302);
    const setCookie = loginRes.headers.get('Set-Cookie');
    const cookieMatch = (setCookie as string).match(/(?:^|;)\s*(gallery_auth=[^;]+)/);
    const cookieHeader = cookieMatch ? cookieMatch[1] : '';

    const res = await worker.fetch(new Request('https://example.com/api/generate-airplay-url', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
      },
      body: JSON.stringify({ videoId: 'videos/clip.mov' }),
    }), env);

    expect(res.status).toBe(200);
    const { airplayUrl } = await res.json();
    expect(airplayUrl).toMatch(/\/api\/airplay\/[0-9a-f-]+\/video\.m3u8$/);
    
    const tokenMatch = airplayUrl.match(/\/api\/airplay\/(.+?)\/video\.m3u8$/);
    expect(tokenMatch).toBeTruthy();
    const token = tokenMatch![1];
    
    expect(storedToken).toBe(token);
    const tokenData = JSON.parse(storedData);
    expect(tokenData).toMatchObject({
      videoId: 'videos/clip.mov',
      authenticated: true,
    });
    expect(tokenData.createdAt).toBeTypeOf('number');
  });

  it('rejects missing videoId', async () => {
    const env = {
      R2_BUCKET: {} as any,
      DB: {} as any,
      CACHE_VERSION: { get: async () => '1' } as any,
      AIRPLAY_TOKENS: {
        get: async () => null,
        put: async () => {},
      } as any,
      AUTH_SECRET: 'super-secret',
    } as any;

    const res = await worker.fetch(new Request('https://example.com/api/generate-airplay-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }), env);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'videoId is required' });
  });

  it('no auth required when GALLERY_PASSWORD not set', async () => {
    let storedToken = '';
    
    const env = {
      R2_BUCKET: {} as any,
      DB: {} as any,
      CACHE_VERSION: { get: async () => '1' } as any,
      AIRPLAY_TOKENS: {
        get: async () => null,
        put: async (key: string, value: string) => {
          storedToken = key;
        },
      } as any,
      AUTH_SECRET: 'super-secret',
    } as any;

    const res = await worker.fetch(new Request('https://example.com/api/generate-airplay-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoId: 'videos/clip.mov' }),
    }), env);

    expect(res.status).toBe(200);
    const { airplayUrl } = await res.json();
    expect(airplayUrl).toMatch(/\/api\/airplay\/[0-9a-f-]+\/video\.m3u8$/);
    expect(storedToken).toBeTruthy();
  });
});

describe('AirPlay HLS serving', () => {
  const masterManifest = `#EXTM3U
#EXT-X-VERSION:3
720p.m3u8
480p.m3u8`;

  const variantPlaylist = `#EXTM3U
#EXT-X-TARGETDURATION:4
#EXTINF:4.000,
720p_000.ts
#EXTINF:4.000,
720p_001.ts`;

  const segmentData = new Uint8Array([0x47, 0x40, 0x00, 0x10]);

  function createEnvWithHLS(token: string, videoId: string) {
    const tokenData = JSON.stringify({
      videoId,
      createdAt: Date.now(),
      authenticated: true,
    });

    return {
      R2_BUCKET: {
        get: async (key: string) => {
          if (key === `hls/${videoId}/master.m3u8`) {
            return {
              text: async () => masterManifest,
              httpMetadata: { contentType: 'application/vnd.apple.mpegurl' },
              httpEtag: 'etag1',
              writeHttpMetadata: (headers: Headers) => {
                headers.set('Content-Type', 'application/vnd.apple.mpegurl');
              },
            };
          }
          if (key === `hls/${videoId}/720p.m3u8`) {
            return {
              text: async () => variantPlaylist,
              httpMetadata: { contentType: 'application/vnd.apple.mpegurl' },
              httpEtag: 'etag2',
              writeHttpMetadata: (headers: Headers) => {
                headers.set('Content-Type', 'application/vnd.apple.mpegurl');
              },
            };
          }
          if (key === `hls/${videoId}/720p_000.ts`) {
            return {
              body: segmentData,
              httpMetadata: { contentType: 'video/MP2T' },
              httpEtag: 'etag3',
              writeHttpMetadata: (headers: Headers) => {
                headers.set('Content-Type', 'video/MP2T');
              },
            };
          }
          return null;
        },
      } as any,
      DB: {} as any,
      CACHE_VERSION: { get: async () => '1' } as any,
      AIRPLAY_TOKENS: {
        get: async (key: string) => (key === token ? tokenData : null),
        put: async () => {},
      } as any,
      AUTH_SECRET: 'super-secret',
    } as any;
  }

  it('rewrites master manifest with token', async () => {
    const token = 'test-token-123';
    const videoId = 'videos/clip.mov';
    const env = createEnvWithHLS(token, videoId);

    const res = await worker.fetch(
      new Request(`https://example.com/api/airplay/${token}/video.m3u8`),
      env
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/vnd.apple.mpegurl');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    
    const text = await res.text();
    expect(text).toContain(`/api/airplay/${token}/720p.m3u8`);
    expect(text).toContain(`/api/airplay/${token}/480p.m3u8`);
    expect(text).toContain('#EXTM3U');
    expect(text).toContain('#EXT-X-VERSION:3');
  });

  it('rewrites variant playlist with token', async () => {
    const token = 'test-token-456';
    const videoId = 'videos/clip.mov';
    const env = createEnvWithHLS(token, videoId);

    const res = await worker.fetch(
      new Request(`https://example.com/api/airplay/${token}/720p.m3u8`),
      env
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/vnd.apple.mpegurl');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    
    const text = await res.text();
    expect(text).toContain(`/api/airplay/${token}/720p_000.ts`);
    expect(text).toContain(`/api/airplay/${token}/720p_001.ts`);
    expect(text).toContain('#EXTM3U');
    expect(text).toContain('#EXT-X-TARGETDURATION:4');
  });

  it('serves segment with correct headers', async () => {
    const token = 'test-token-789';
    const videoId = 'videos/clip.mov';
    const env = createEnvWithHLS(token, videoId);

    const res = await worker.fetch(
      new Request(`https://example.com/api/airplay/${token}/720p_000.ts`),
      env
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('video/MP2T');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=2592000');
    
    const body = await res.arrayBuffer();
    expect(new Uint8Array(body)).toEqual(segmentData);
  });

  it('returns 404 for missing files', async () => {
    const token = 'test-token-404';
    const videoId = 'videos/clip.mov';
    const env = createEnvWithHLS(token, videoId);

    const res1 = await worker.fetch(
      new Request(`https://example.com/api/airplay/${token}/missing.m3u8`),
      env
    );
    expect(res1.status).toBe(404);
    expect(await res1.text()).toBe('HLS file not found');

    const res2 = await worker.fetch(
      new Request(`https://example.com/api/airplay/${token}/missing.ts`),
      env
    );
    expect(res2.status).toBe(404);
    expect(await res2.text()).toBe('HLS file not found');
  });
});

describe('AirPlay security', () => {
  it('prevents token enumeration with generic error', async () => {
    const env = {
      R2_BUCKET: {} as any,
      DB: {} as any,
      CACHE_VERSION: { get: async () => '1' } as any,
      AIRPLAY_TOKENS: {
        get: async () => null,
      } as any,
      AUTH_SECRET: 'super-secret',
    } as any;

    const res = await worker.fetch(
      new Request('https://example.com/api/airplay/bad-token/video.m3u8'),
      env
    );

    expect(res.status).toBe(403);
    expect(await res.text()).toBe('Unauthorized');
  });

  it('rejects expired/deleted tokens', async () => {
    const token = 'expired-token';
    const env = {
      R2_BUCKET: {} as any,
      DB: {} as any,
      CACHE_VERSION: { get: async () => '1' } as any,
      AIRPLAY_TOKENS: {
        get: async (key: string) => null,
      } as any,
      AUTH_SECRET: 'super-secret',
    } as any;

    const res = await worker.fetch(
      new Request(`https://example.com/api/airplay/${token}/video.m3u8`),
      env
    );

    expect(res.status).toBe(403);
    expect(await res.text()).toBe('Unauthorized');
  });

  it('rejects invalid path formats', async () => {
    const env = {
      R2_BUCKET: {} as any,
      DB: {} as any,
      CACHE_VERSION: { get: async () => '1' } as any,
      AIRPLAY_TOKENS: {
        get: async () => null,
      } as any,
      AUTH_SECRET: 'super-secret',
    } as any;

    const res1 = await worker.fetch(
      new Request('https://example.com/api/airplay/token-only'),
      env
    );
    expect(res1.status).toBe(403);
    expect(await res1.text()).toBe('Unauthorized');

    const res2 = await worker.fetch(
      new Request('https://example.com/api/airplay//video.m3u8'),
      env
    );
    expect(res2.status).toBe(403);
    expect(await res2.text()).toBe('Unauthorized');
  });
});
