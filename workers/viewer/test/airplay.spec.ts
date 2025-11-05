import { describe, it, expect } from 'vitest';
import worker from '../src/index';

describe('AirPlay token-based authentication', () => {
  const mockEnv = {
    R2_BUCKET: {
      get: async (key: string) => {
        if (key.startsWith('hls/')) {
          // Mock HLS manifest
          if (key.endsWith('master.m3u8')) {
            return {
              text: async () => `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXTINF:10.0,
segment0.ts
segment1.ts
#EXT-X-ENDLIST`,
              httpEtag: '"abc123"',
              writeHttpMetadata: (headers: Headers) => {
                headers.set('Content-Type', 'application/vnd.apple.mpegurl');
              },
            };
          }
          // Mock HLS segment
          if (key.endsWith('.ts')) {
            return {
              body: new Uint8Array([1, 2, 3, 4]),
              httpEtag: '"segment123"',
              writeHttpMetadata: (headers: Headers) => {
                headers.set('Content-Type', 'video/MP2T');
              },
            };
          }
        }
        return null;
      },
    } as any,
    DB: {} as any,
    CACHE_VERSION: { get: async () => '1' } as any,
    AIRPLAY_TOKENS: {
      put: async () => {},
      get: async (token: string) => {
        // Mock token validation - only 'valid-token' is valid
        if (token === 'valid-token') {
          return JSON.stringify({ videoKey: 'test-video.mp4', createdAt: Date.now() });
        }
        return null;
      },
    } as any,
    GALLERY_PASSWORD: 'test-password',
    AUTH_SECRET: 'test-secret',
  } as any;

  describe('Token generation endpoint', () => {
    it('requires authentication when password is set', async () => {
      const req = new Request('https://example.com/api/generate-airplay-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoKey: 'test-video.mp4' }),
      });

      const res = await worker.fetch(req, mockEnv);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body).toEqual({ error: 'Unauthorized' });
    });

    it('generates token for authenticated user', async () => {
      // First login to get auth cookie
      const loginReq = new Request('https://example.com/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'password=test-password',
      });
      const loginRes = await worker.fetch(loginReq, mockEnv);
      const setCookie = loginRes.headers.get('Set-Cookie');
      const cookieMatch = (setCookie as string).match(/(?:^|;)\s*(gallery_auth=[^;]+)/);
      const cookieHeader = cookieMatch ? cookieMatch[1] : '';

      // Now generate AirPlay URL
      const req = new Request('https://example.com/api/generate-airplay-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cookie': cookieHeader,
        },
        body: JSON.stringify({ videoKey: 'test-video.mp4' }),
      });

      const res = await worker.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      const body = await res.json() as { airplayUrl: string };
      expect(body.airplayUrl).toMatch(/^https:\/\/example\.com\/api\/airplay\/[a-f0-9]{64}\/master\.m3u8$/);
    });

    it('works without authentication when no password is set', async () => {
      const envNoPassword = {
        ...mockEnv,
        GALLERY_PASSWORD: undefined,
        AUTH_SECRET: undefined,
      };

      const req = new Request('https://example.com/api/generate-airplay-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoKey: 'test-video.mp4' }),
      });

      const res = await worker.fetch(req, envNoPassword);
      expect(res.status).toBe(200);
      const body = await res.json() as { airplayUrl: string };
      expect(body.airplayUrl).toMatch(/^https:\/\/example\.com\/api\/airplay\/[a-f0-9]{64}\/master\.m3u8$/);
    });

    it('returns 400 for missing videoKey', async () => {
      const envNoPassword = {
        ...mockEnv,
        GALLERY_PASSWORD: undefined,
        AUTH_SECRET: undefined,
      };

      const req = new Request('https://example.com/api/generate-airplay-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const res = await worker.fetch(req, envNoPassword);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body).toEqual({ error: 'Missing videoKey' });
    });

    it('returns 405 for non-POST requests', async () => {
      const req = new Request('https://example.com/api/generate-airplay-url', {
        method: 'GET',
      });

      const res = await worker.fetch(req, mockEnv);
      expect(res.status).toBe(405);
    });
  });

  describe('Token validation and HLS delivery', () => {
    it('rejects invalid tokens', async () => {
      const req = new Request('https://example.com/api/airplay/invalid-token/master.m3u8');
      const res = await worker.fetch(req, mockEnv);
      expect(res.status).toBe(403);
      expect(await res.text()).toBe('Invalid or expired token');
    });

    it('rejects expired tokens', async () => {
      const req = new Request('https://example.com/api/airplay/expired-token/master.m3u8');
      const res = await worker.fetch(req, mockEnv);
      expect(res.status).toBe(403);
      expect(await res.text()).toBe('Invalid or expired token');
    });

    it('serves manifest with tokenized URLs for valid token', async () => {
      const req = new Request('https://example.com/api/airplay/valid-token/master.m3u8');
      const res = await worker.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('application/vnd.apple.mpegurl');
      expect(res.headers.get('Cache-Control')).toBe('no-cache');

      const manifest = await res.text();
      expect(manifest).toContain('/api/airplay/valid-token/segment0.ts');
      expect(manifest).toContain('/api/airplay/valid-token/segment1.ts');
      expect(manifest).not.toContain('segment0.ts\n'); // Should not have non-tokenized URLs
    });

    it('serves segments for valid token', async () => {
      const req = new Request('https://example.com/api/airplay/valid-token/segment0.ts');
      const res = await worker.fetch(req, mockEnv);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toBe('video/MP2T');
      expect(res.headers.get('Cache-Control')).toBe('public, max-age=2592000');
      expect(res.headers.get('etag')).toBe('"segment123"');
    });

    it('returns 400 for invalid path format', async () => {
      const req = new Request('https://example.com/api/airplay/valid-token');
      const res = await worker.fetch(req, mockEnv);
      expect(res.status).toBe(400);
      expect(await res.text()).toBe('Invalid AirPlay path');
    });

    it('returns 404 for non-existent HLS files', async () => {
      const envWithMissingFile = {
        ...mockEnv,
        R2_BUCKET: {
          get: async () => null,
        } as any,
      };

      const req = new Request('https://example.com/api/airplay/valid-token/nonexistent.m3u8');
      const res = await worker.fetch(req, envWithMissingFile);
      expect(res.status).toBe(404);
      expect(await res.text()).toBe('HLS file not found');
    });

    it('returns 400 for unsupported file types', async () => {
      const req = new Request('https://example.com/api/airplay/valid-token/file.txt');
      const res = await worker.fetch(req, mockEnv);
      expect(res.status).toBe(400);
      expect(await res.text()).toBe('Unsupported file type');
    });
  });

  describe('Manifest URL rewriting', () => {
    it('rewrites nested playlist URLs', async () => {
      const envWithNestedPlaylist = {
        ...mockEnv,
        R2_BUCKET: {
          get: async (key: string) => {
            if (key.endsWith('master.m3u8')) {
              return {
                text: async () => `#EXTM3U
#EXT-X-STREAM-INF:BANDWIDTH=800000
720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=1200000
1080p.m3u8`,
                httpEtag: '"master123"',
                writeHttpMetadata: (headers: Headers) => {
                  headers.set('Content-Type', 'application/vnd.apple.mpegurl');
                },
              };
            }
            return null;
          },
        } as any,
      };

      const req = new Request('https://example.com/api/airplay/valid-token/master.m3u8');
      const res = await worker.fetch(req, envWithNestedPlaylist);
      expect(res.status).toBe(200);

      const manifest = await res.text();
      expect(manifest).toContain('/api/airplay/valid-token/720p.m3u8');
      expect(manifest).toContain('/api/airplay/valid-token/1080p.m3u8');
    });

    it('does not rewrite comment lines', async () => {
      const envWithComments = {
        ...mockEnv,
        R2_BUCKET: {
          get: async (key: string) => {
            if (key.endsWith('master.m3u8')) {
              return {
                text: async () => `#EXTM3U
#EXT-X-VERSION:3
# This is a comment with .ts in it
#EXTINF:10.0,
segment0.ts`,
                httpEtag: '"master123"',
                writeHttpMetadata: (headers: Headers) => {
                  headers.set('Content-Type', 'application/vnd.apple.mpegurl');
                },
              };
            }
            return null;
          },
        } as any,
      };

      const req = new Request('https://example.com/api/airplay/valid-token/master.m3u8');
      const res = await worker.fetch(req, envWithComments);
      expect(res.status).toBe(200);

      const manifest = await res.text();
      expect(manifest).toContain('# This is a comment with .ts in it');
      expect(manifest).not.toContain('/api/airplay/valid-token/# This is a comment');
    });
  });
});
