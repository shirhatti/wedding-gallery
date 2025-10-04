import { describe, it, expect } from 'vitest';
import worker from '../src/index';

describe('Thumbnail API', () => {
  it('should return 404 for non-existent thumbnail', async () => {
    const env = {
      R2_BUCKET: {
        head: async () => null,
      },
      DB: {} as D1Database,
    };

    const request = new Request('https://example.com/api/thumbnail/nonexistent.jpg');
    const response = await worker.fetch(request, env as any);

    expect(response.status).toBe(404);
  });

  it('should return 304 when ETag matches', async () => {
    const mockEtag = '"abc123"';
    const env = {
      R2_BUCKET: {
        head: async () => ({
          httpEtag: mockEtag,
        }),
      },
      DB: {} as D1Database,
    };

    const request = new Request('https://example.com/api/thumbnail/test.jpg', {
      headers: {
        'If-None-Match': mockEtag,
      },
    });
    const response = await worker.fetch(request, env as any);

    expect(response.status).toBe(304);
    expect(response.headers.get('etag')).toBe(mockEtag);
  });

  it('should return thumbnail with ETag when no If-None-Match header', async () => {
    const mockEtag = '"abc123"';
    const mockBody = new Uint8Array([1, 2, 3, 4]);

    const env = {
      R2_BUCKET: {
        head: async () => ({
          httpEtag: mockEtag,
        }),
        get: async () => ({
          body: mockBody,
          httpEtag: mockEtag,
          writeHttpMetadata: (headers: Headers) => {
            headers.set('content-type', 'image/webp');
          },
        }),
      },
      DB: {} as D1Database,
    };

    const request = new Request('https://example.com/api/thumbnail/test.jpg?size=medium');
    const response = await worker.fetch(request, env as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe(mockEtag);
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=2592000');
  });

  it('should return thumbnail when ETag does not match', async () => {
    const oldEtag = '"old123"';
    const newEtag = '"new456"';
    const mockBody = new Uint8Array([1, 2, 3, 4]);

    const env = {
      R2_BUCKET: {
        head: async () => ({
          httpEtag: newEtag,
        }),
        get: async () => ({
          body: mockBody,
          httpEtag: newEtag,
          writeHttpMetadata: (headers: Headers) => {
            headers.set('content-type', 'image/webp');
          },
        }),
      },
      DB: {} as D1Database,
    };

    const request = new Request('https://example.com/api/thumbnail/test.jpg', {
      headers: {
        'If-None-Match': oldEtag,
      },
    });
    const response = await worker.fetch(request, env as any);

    expect(response.status).toBe(200);
    expect(response.headers.get('etag')).toBe(newEtag);
  });

  it('should support different thumbnail sizes', async () => {
    const mockEtag = '"abc123"';
    const mockBody = new Uint8Array([1, 2, 3, 4]);

    const getSpy = async (key: string) => {
      expect(key).toBe('thumbnails/small/test.jpg');
      return {
        body: mockBody,
        httpEtag: mockEtag,
        writeHttpMetadata: (headers: Headers) => {
          headers.set('content-type', 'image/webp');
        },
      };
    };

    const headSpy = async (key: string) => {
      expect(key).toBe('thumbnails/small/test.jpg');
      return {
        httpEtag: mockEtag,
      };
    };

    const env = {
      R2_BUCKET: {
        head: headSpy,
        get: getSpy,
      },
      DB: {} as D1Database,
    };

    const request = new Request('https://example.com/api/thumbnail/test.jpg?size=small');
    const response = await worker.fetch(request, env as any);

    expect(response.status).toBe(200);
  });
});
