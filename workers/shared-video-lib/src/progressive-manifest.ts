/**
 * Progressive HLS manifest delivery
 * Streams manifest with first segments immediately, signs remaining in background
 */

import { Parser as M3U8Parser } from "m3u8-parser";

export interface ProgressiveManifestOptions {
  /**
   * Number of segments to sign immediately before streaming
   * Default: 5 (about 20 seconds of video at 4s per segment)
   */
  initialSegments?: number;

  /**
   * Function to batch sign segment URIs
   */
  batchSignUris: (uris: string[]) => Promise<string[]>;
}

/**
 * Generate a media playlist progressively
 *
 * Strategy:
 * 1. Parse manifest and identify segments
 * 2. Sign first N segments immediately (fast!)
 * 3. Start streaming response with header + first segments
 * 4. Sign remaining segments in background
 * 5. Stream remaining segments as they're signed
 *
 * Result: Player starts buffering within ~20-40ms instead of waiting
 * for all 150-600 segments to be signed (~150-300ms)
 */
export async function generateProgressiveManifest(
  manifestContent: string,
  options: ProgressiveManifestOptions
): Promise<ReadableStream> {
  const { initialSegments = 5, batchSignUris } = options;

  // Parse the manifest
  const parser = new M3U8Parser();
  parser.push(manifestContent);
  parser.end();

  const manifest = parser.manifest;

  if (!manifest.segments || manifest.segments.length === 0) {
    throw new Error("Not a valid media playlist");
  }

  const allSegments = manifest.segments;

  // Split segments into initial and remaining
  const initialSegmentData = allSegments.slice(0, initialSegments);
  const remainingSegmentData = allSegments.slice(initialSegments);

  // Create a readable stream
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Start async processing
  (async () => {
    try {
      // 1. Write manifest header immediately
      const headerLines = [
        "#EXTM3U",
        `#EXT-X-VERSION:${manifest.version || 3}`,
        `#EXT-X-TARGETDURATION:${manifest.targetDuration || 10}`,
      ];

      if (manifest.mediaSequence !== undefined) {
        headerLines.push(`#EXT-X-MEDIA-SEQUENCE:${manifest.mediaSequence}`);
      }

      await writer.write(encoder.encode(headerLines.join("\n") + "\n"));

      // 2. Sign and write initial segments immediately
      if (initialSegmentData.length > 0) {
        const initialUris = initialSegmentData.map(seg => seg.uri);
        const signedInitialUris = await batchSignUris(initialUris);

        for (let i = 0; i < initialSegmentData.length; i++) {
          const segment = initialSegmentData[i];
          const lines = [
            `#EXTINF:${segment.duration.toFixed(6)},`,
            signedInitialUris[i],
          ];
          await writer.write(encoder.encode(lines.join("\n") + "\n"));
        }
      }

      // 3. Sign and stream remaining segments in background
      if (remainingSegmentData.length > 0) {
        const remainingUris = remainingSegmentData.map(seg => seg.uri);
        const signedRemainingUris = await batchSignUris(remainingUris);

        for (let i = 0; i < remainingSegmentData.length; i++) {
          const segment = remainingSegmentData[i];
          const lines = [
            `#EXTINF:${segment.duration.toFixed(6)},`,
            signedRemainingUris[i],
          ];
          await writer.write(encoder.encode(lines.join("\n") + "\n"));
        }
      }

      // 4. Write end tag
      if (manifest.endList) {
        await writer.write(encoder.encode("#EXT-X-ENDLIST\n"));
      }

      await writer.close();
    } catch (error) {
      console.error("Progressive manifest generation error:", error);
      await writer.abort(error);
    }
  })();

  return readable;
}

/**
 * Lazy segment signing approach
 * Instead of signing all segments upfront, use worker URLs that redirect on-demand
 *
 * This makes manifest generation instant (~1-5ms) but adds slight latency
 * to first segment fetch (~10-20ms for signing + redirect)
 *
 * Best for:
 * - Infrequently watched videos (low cache hit rate)
 * - Very long videos (hundreds of segments)
 * - When you want minimal TTFB
 */
export async function generateLazyManifest(
  manifestContent: string,
  workerBaseUrl: string,
  videoKey: string
): Promise<string> {
  const parser = new M3U8Parser();
  parser.push(manifestContent);
  parser.end();

  const manifest = parser.manifest;

  if (!manifest.segments || manifest.segments.length === 0) {
    throw new Error("Not a valid media playlist");
  }

  // Build output with worker URLs instead of presigned URLs
  const lines: string[] = [
    "#EXTM3U",
    `#EXT-X-VERSION:${manifest.version || 3}`,
    `#EXT-X-TARGETDURATION:${manifest.targetDuration || 10}`,
  ];

  if (manifest.mediaSequence !== undefined) {
    lines.push(`#EXT-X-MEDIA-SEQUENCE:${manifest.mediaSequence}`);
  }

  // Each segment URL points to worker endpoint that will sign and redirect
  for (const segment of manifest.segments) {
    lines.push(`#EXTINF:${segment.duration.toFixed(6)},`);
    // URL format: /api/hls-segment/:videoKey/:segmentFile
    lines.push(`${workerBaseUrl}/api/hls-segment/${videoKey}/${segment.uri}`);
  }

  if (manifest.endList) {
    lines.push("#EXT-X-ENDLIST");
  }

  return lines.join("\n");
}
