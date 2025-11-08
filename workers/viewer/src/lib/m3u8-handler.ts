/**
 * Robust M3U8 playlist handling using industry-standard parser
 * Avoids brittle string manipulation
 */

import { Parser as M3U8Parser } from 'm3u8-parser';

export interface M3U8RewriteOptions {
  /**
   * Function to rewrite URIs in the playlist
   * @param uri - Original URI from the playlist
   * @param type - Type of URI ('segment', 'playlist', or 'other')
   * @returns Modified URI
   */
  rewriteUri: (uri: string, type: 'segment' | 'playlist' | 'other') => string | Promise<string>;
}

/**
 * Parse and rewrite M3U8 master playlist
 * Master playlists contain references to variant playlists (different qualities)
 */
export async function rewriteMasterPlaylist(
  content: string,
  options: M3U8RewriteOptions
): Promise<string> {
  const parser = new M3U8Parser();
  parser.push(content);
  parser.end();

  const manifest = parser.manifest;

  // Master playlists have a 'playlists' array
  if (!manifest.playlists || manifest.playlists.length === 0) {
    throw new Error('Not a valid master playlist');
  }

  // Build output line by line
  const lines: string[] = ['#EXTM3U'];

  // Process each variant playlist
  for (const playlist of manifest.playlists) {
    const attributes = playlist.attributes;

    // Build #EXT-X-STREAM-INF line
    const streamInf = ['#EXT-X-STREAM-INF'];
    const attrs: string[] = [];

    if (attributes.BANDWIDTH !== undefined) {
      attrs.push(`BANDWIDTH=${attributes.BANDWIDTH}`);
    }
    if (attributes.RESOLUTION) {
      attrs.push(`RESOLUTION=${attributes.RESOLUTION.width}x${attributes.RESOLUTION.height}`);
    }
    if (attributes.CODECS) {
      attrs.push(`CODECS="${attributes.CODECS}"`);
    }
    if (attributes['FRAME-RATE']) {
      attrs.push(`FRAME-RATE=${attributes['FRAME-RATE']}`);
    }
    if (attributes.AUDIO) {
      attrs.push(`AUDIO="${attributes.AUDIO}"`);
    }
    if (attributes.VIDEO) {
      attrs.push(`VIDEO="${attributes.VIDEO}"`);
    }

    lines.push(`${streamInf}:${attrs.join(',')}`);

    // Rewrite playlist URI
    const rewrittenUri = await options.rewriteUri(playlist.uri, 'playlist');
    lines.push(rewrittenUri);
  }

  return lines.join('\n');
}

/**
 * Parse and rewrite M3U8 media/variant playlist
 * Media playlists contain references to segments (actual video chunks)
 */
export async function rewriteMediaPlaylist(
  content: string,
  options: M3U8RewriteOptions
): Promise<string> {
  const parser = new M3U8Parser();
  parser.push(content);
  parser.end();

  const manifest = parser.manifest;

  // Media playlists have a 'segments' array
  if (!manifest.segments || manifest.segments.length === 0) {
    throw new Error('Not a valid media playlist');
  }

  // Build output
  const lines: string[] = [
    '#EXTM3U',
    `#EXT-X-VERSION:${manifest.version || 3}`,
    `#EXT-X-TARGETDURATION:${manifest.targetDuration || 10}`,
  ];

  if (manifest.mediaSequence !== undefined) {
    lines.push(`#EXT-X-MEDIA-SEQUENCE:${manifest.mediaSequence}`);
  }

  // Process segments
  for (const segment of manifest.segments) {
    // Add EXTINF tag
    lines.push(`#EXTINF:${segment.duration.toFixed(6)},`);

    // Rewrite segment URI
    const rewrittenUri = await options.rewriteUri(segment.uri, 'segment');
    lines.push(rewrittenUri);
  }

  // Add end tag if present
  if (manifest.endList) {
    lines.push('#EXT-X-ENDLIST');
  }

  return lines.join('\n');
}

/**
 * Auto-detect playlist type and rewrite appropriately
 */
export async function rewritePlaylist(
  content: string,
  options: M3U8RewriteOptions
): Promise<string> {
  const parser = new M3U8Parser();
  parser.push(content);
  parser.end();

  const manifest = parser.manifest;

  // Determine playlist type
  if (manifest.playlists && manifest.playlists.length > 0) {
    return rewriteMasterPlaylist(content, options);
  } else if (manifest.segments && manifest.segments.length > 0) {
    return rewriteMediaPlaylist(content, options);
  } else {
    throw new Error('Unknown playlist type');
  }
}

/**
 * Batch rewrite URIs in a media playlist using async batch signing
 * This is optimized for HLS with presigned URLs
 */
export async function batchRewriteMediaPlaylist(
  content: string,
  batchRewriteUris: (uris: string[]) => Promise<string[]>
): Promise<string> {
  const parser = new M3U8Parser();
  parser.push(content);
  parser.end();

  const manifest = parser.manifest;

  if (!manifest.segments || manifest.segments.length === 0) {
    throw new Error('Not a valid media playlist');
  }

  // Collect all URIs
  const uris = manifest.segments.map(seg => seg.uri);

  // Batch rewrite all URIs at once (e.g., batch signing)
  const rewrittenUris = await batchRewriteUris(uris);

  // Build output
  const lines: string[] = [
    '#EXTM3U',
    `#EXT-X-VERSION:${manifest.version || 3}`,
    `#EXT-X-TARGETDURATION:${manifest.targetDuration || 10}`,
  ];

  if (manifest.mediaSequence !== undefined) {
    lines.push(`#EXT-X-MEDIA-SEQUENCE:${manifest.mediaSequence}`);
  }

  // Process segments with rewritten URIs
  manifest.segments.forEach((segment, index) => {
    lines.push(`#EXTINF:${segment.duration.toFixed(6)},`);
    lines.push(rewrittenUris[index]);
  });

  if (manifest.endList) {
    lines.push('#EXT-X-ENDLIST');
  }

  return lines.join('\n');
}
