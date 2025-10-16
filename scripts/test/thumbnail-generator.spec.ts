import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'fs';
import path from 'path';

vi.mock('child_process', () => {
  return {
    execFileSync: vi.fn(),
  };
});

vi.mock('sharp', () => {
  return {
    default: () => ({
      toBuffer: async () => Buffer.from('mock-image'),
    }),
  };
});

// 1x1 PNG (valid)
const DUMMY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAuMBgcbR3WQAAAAASUVORK5CYII=';

function writeDummyPng(filePath: string) {
  writeFileSync(filePath, Buffer.from(DUMMY_PNG_BASE64, 'base64'));
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('thumbnail-generator (ffmpeg/ffprobe wrappers)', () => {
  it('extractVideoMetadata parses ffprobe JSON output', async () => {
    const cp = await import('child_process');
    // @ts-expect-error mocked by vi.mock
    cp.execFileSync.mockImplementation((cmd: any) => {
      if (cmd === 'ffprobe') {
        return JSON.stringify({
          format: { duration: '2.5', tags: { creation_time: '2024-01-02T03:04:05Z' } },
          streams: [],
        });
      }
      return '';
    });

    const mod = await import('../lib/thumbnail-generator.mjs');
    const input = Buffer.from([0]);
    const result = await mod.extractVideoMetadata(input);
    expect(result.creation_time).toBe('2024-01-02T03:04:05Z');
    expect(result.duration).toBeCloseTo(2.5, 5);
  });

  it('extractVideoThumbnail uses 1s seek for >=1s videos', async () => {
    const cp = await import('child_process');
    let capturedFfmpegArgs: string[] = [];
    // @ts-expect-error mocked by vi.mock
    cp.execFileSync.mockImplementation((cmd: any, args: any[]) => {
      if (cmd === 'ffprobe') {
        return JSON.stringify({ format: { duration: '2.0' }, streams: [] });
      }
      if (cmd === 'ffmpeg') {
        capturedFfmpegArgs = args as string[];
        const outPath = capturedFfmpegArgs[capturedFfmpegArgs.length - 1];
        writeDummyPng(outPath);
        return '';
      }
      return '';
    });

    const mod = await import('../lib/thumbnail-generator.mjs');
    const input = Buffer.from([0]);
    const buf = await mod.extractVideoThumbnail(input);
    expect(Buffer.isBuffer(buf)).toBe(true);
    const ssIndex = capturedFfmpegArgs.indexOf('-ss');
    expect(ssIndex).toBeGreaterThanOrEqual(0);
    expect(capturedFfmpegArgs[ssIndex + 1]).toBe('1');
  });

  it('extractVideoThumbnail picks midpoint for <1s videos', async () => {
    const cp = await import('child_process');
    let capturedFfmpegArgs: string[] = [];
    // @ts-expect-error mocked by vi.mock
    cp.execFileSync.mockImplementation((cmd: any, args: any[]) => {
      if (cmd === 'ffprobe') {
        return JSON.stringify({ format: { duration: '0.6' }, streams: [] });
      }
      if (cmd === 'ffmpeg') {
        capturedFfmpegArgs = args as string[];
        const outPath = capturedFfmpegArgs[capturedFfmpegArgs.length - 1];
        writeDummyPng(outPath);
        return '';
      }
      return '';
    });

    const mod = await import('../lib/thumbnail-generator.mjs');
    const input = Buffer.from([0]);
    const buf = await mod.extractVideoThumbnail(input);
    expect(Buffer.isBuffer(buf)).toBe(true);
    const ssIndex = capturedFfmpegArgs.indexOf('-ss');
    expect(ssIndex).toBeGreaterThanOrEqual(0);
    // Half of 0.6 => 0.300 (toFixed(3))
    expect(capturedFfmpegArgs[ssIndex + 1]).toBe('0.300');
  });

  it('extractVideoMetadata surfaces friendly error and logs stderr', async () => {
    const cp = await import('child_process');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // @ts-expect-error mocked by vi.mock
    cp.execFileSync.mockImplementation((cmd: any) => {
      if (cmd === 'ffprobe') {
        const err: any = new Error('ffprobe failed');
        err.stderr = Buffer.from('simulated ffprobe stderr');
        throw err;
      }
      return '';
    });

    const mod = await import('../lib/thumbnail-generator.mjs');
    const input = Buffer.from([0]);
    await expect(mod.extractVideoMetadata(input)).rejects.toThrow('extractVideoMetadata: ffprobe failed');
    expect(errorSpy).toHaveBeenCalled();
  });
});
