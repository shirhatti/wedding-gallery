import { describe, it, expect } from 'vitest';
import worker from '../src/index';

describe('Auth and Range handling', () => {
  it('auth flow: redirects, sets cookie, then allows access', async () => {
    const env = {
      R2_BUCKET: {} as any,
      DB: {} as any,
      CACHE_VERSION: { get: async () => '1' } as any,
      GALLERY_PASSWORD: 'pw',
      AUTH_SECRET: 'super-secret',
    } as any;

    // 1) no cookie -> redirect to /login
    const res1 = await worker.fetch(new Request('https://example.com/'), env);
    expect(res1.status).toBe(302);
    expect(res1.headers.get('Location')).toBe('https://example.com/login');

    // 2) login with correct password -> 302 and Set-Cookie
    const loginReq = new Request('https://example.com/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'password=pw',
    });
    const res2 = await worker.fetch(loginReq, env);
    expect(res2.status).toBe(302);
    const setCookie = res2.headers.get('Set-Cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie as string).toMatch(/gallery_auth=/);

    // 3) pass cookie -> should access home page
    const res3 = await worker.fetch(new Request('https://example.com/', {
      headers: { Cookie: setCookie as string },
    }), env);
    expect(res3.status).toBe(200);
    expect(res3.headers.get('Content-Type')).toMatch(/text\/html/);
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
