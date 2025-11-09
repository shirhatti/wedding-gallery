import { describe, it, expect } from 'vitest';
import worker from '../src/index';

describe('Auth and Range handling', () => {
  it('auth flow: redirects to login when no cookie present', async () => {
    const env = {
      R2_BUCKET: {} as any,
      DB: {} as any,
      CACHE_VERSION: { get: async () => '1' } as any,
      GALLERY_PASSWORD: 'pw',
      AUTH_SECRET: 'super-secret',
    } as any;

    // no cookie -> redirect to /login with returnTo parameter
    // Note: /login is now handled by Pages Function, not viewer worker
    const res = await worker.fetch(new Request('https://example.com/'), env);
    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe('https://example.com/login?returnTo=%2F');
  });

  it('range request: returns 206 with proper headers', async () => {
    const mockBody = new Uint8Array([2, 3, 4, 5]); // 4 bytes for range 2-5
    const env = {
      R2_BUCKET: {
        get: async (_key: string, _opts?: any) => ({
          body: mockBody,
          size: 10,
          httpMetadata: { contentType: 'video/mp4' },
          writeHttpMetadata: (headers: Headers) => {
            headers.set('Content-Type', 'video/mp4');
          },
        }),
      },
      DB: {} as any,
      CACHE_VERSION: { get: async () => '1' } as any,
    } as any;

    const req = new Request('https://example.com/api/file/example.mp4', {
      headers: { Range: 'bytes=2-5' },
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(206);
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Content-Range')).toBe('bytes 2-5/10');
    expect(res.headers.get('Content-Length')).toBe('4');
    expect(res.headers.get('Content-Type')).toBe('video/mp4');
  });
});
