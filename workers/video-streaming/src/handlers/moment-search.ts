/**
 * Moment Search Handler
 * Find wedding moments and multi-angle views
 */

import { parseManifest } from '@wedding-gallery/shared-video-lib';
import type {
  MomentSearchResult,
  MomentAngleResult,
  SegmentResult,
  WeddingManifest,
  MomentIndex,
  GlobalMomentIndex
} from '@wedding-gallery/shared-video-lib';
import type { VideoStreamingEnv } from '../types';

/**
 * Handle moment search query
 * GET /api/video/search/moment?moment_id=xxx&wedding_id=xxx
 */
export async function handleMomentSearch(
  request: Request,
  env: VideoStreamingEnv
): Promise<Response> {
  const url = new URL(request.url);
  const moment_id = url.searchParams.get('moment_id');
  const wedding_id = url.searchParams.get('wedding_id') || 'default';

  if (!moment_id) {
    return new Response(
      JSON.stringify({ error: 'Missing moment_id parameter' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Try to get global moment index first (multi-angle view)
    const globalMomentKey = `${wedding_id}/global/moments/${moment_id}.json`;
    const globalMomentObj = await env.R2_BUCKET.get(globalMomentKey);

    if (globalMomentObj) {
      // Global moment exists - return multi-angle view
      const globalMoment = parseManifest<GlobalMomentIndex>(
        await globalMomentObj.text()
      );

      const angles: MomentAngleResult[] = await Promise.all(
        globalMoment.videographers.map(async (vg) => {
          const segments: SegmentResult[] = vg.segments.map(seg_id => ({
            segment_id: seg_id,
            start: globalMoment.start_time,
            duration: globalMoment.duration,
            hls_url: `/api/hls/${wedding_id}/videographers/${vg.videographer_id}/segments/${seg_id}/playlist.m3u8`,
            thumbnail: undefined // TODO: Get from segment manifest
          }));

          // Get videographer name from wedding manifest
          const weddingManifestKey = `${wedding_id}/manifest.json`;
          const weddingManifestObj = await env.R2_BUCKET.get(weddingManifestKey);
          let videographerName = vg.videographer_id;

          if (weddingManifestObj) {
            const weddingManifest = parseManifest<WeddingManifest>(
              await weddingManifestObj.text()
            );
            const videographer = weddingManifest.videographers.find(
              v => v.id === vg.videographer_id
            );
            if (videographer) {
              videographerName = videographer.name;
            }
          }

          return {
            videographer_id: vg.videographer_id,
            videographer_name: videographerName,
            angle: vg.angle,
            segments
          };
        })
      );

      const result: MomentSearchResult = {
        moment_id: globalMoment.moment_id,
        name: globalMoment.name,
        start_time: globalMoment.start_time,
        end_time: globalMoment.end_time,
        angles,
        people_featured: globalMoment.people_featured,
        tags: globalMoment.tags
      };

      return jsonResponse(result);
    }

    // Global moment doesn't exist - search individual videographer indexes
    const weddingManifestKey = `${wedding_id}/manifest.json`;
    const weddingManifestObj = await env.R2_BUCKET.get(weddingManifestKey);

    if (!weddingManifestObj) {
      return new Response(
        JSON.stringify({ error: 'Wedding manifest not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const weddingManifest = parseManifest<WeddingManifest>(
      await weddingManifestObj.text()
    );

    // Search for moment in each videographer's index
    const angles: MomentAngleResult[] = [];

    await Promise.all(
      weddingManifest.videographers.map(async (videographer) => {
        const momentIndexKey = `${wedding_id}/videographers/${videographer.id}/indices/content/moments/index.json.gz`;
        const momentIndexObj = await env.R2_BUCKET.get(momentIndexKey);

        if (!momentIndexObj) {
          return;
        }

        // TODO: Handle gzip decompression
        const momentIndex = parseManifest<MomentIndex>(
          await momentIndexObj.text()
        );

        const moment = momentIndex.moments[moment_id];
        if (!moment) {
          return;
        }

        const segments: SegmentResult[] = moment.segments.map(seg_id => ({
          segment_id: seg_id,
          start: moment.start_time,
          duration: moment.duration,
          hls_url: `/api/hls/${wedding_id}/videographers/${videographer.id}/segments/${seg_id}/playlist.m3u8`,
          thumbnail: moment.thumbnail_uri
        }));

        angles.push({
          videographer_id: videographer.id,
          videographer_name: videographer.name,
          angle: undefined,
          segments
        });
      })
    );

    if (angles.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Moment not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Use first found moment for metadata
    const firstMoment = angles[0].segments[0];

    const result: MomentSearchResult = {
      moment_id,
      name: moment_id, // TODO: Get actual name
      start_time: firstMoment.start,
      end_time: new Date(
        new Date(firstMoment.start).getTime() + firstMoment.duration * 1000
      ).toISOString(),
      angles
    };

    return jsonResponse(result);

  } catch (error) {
    console.error('Moment search error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Handle moment list query
 * GET /api/video/moments?wedding_id=xxx&type=ceremony
 */
export async function handleMomentList(
  request: Request,
  env: VideoStreamingEnv
): Promise<Response> {
  const url = new URL(request.url);
  const wedding_id = url.searchParams.get('wedding_id') || 'default';
  const moment_type = url.searchParams.get('type');

  try {
    // Get wedding manifest
    const weddingManifestKey = `${wedding_id}/manifest.json`;
    const weddingManifestObj = await env.R2_BUCKET.get(weddingManifestKey);

    if (!weddingManifestObj) {
      return new Response(
        JSON.stringify({ error: 'Wedding manifest not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const weddingManifest = parseManifest<WeddingManifest>(
      await weddingManifestObj.text()
    );

    // Collect moments from all videographers
    const allMoments: Array<{
      moment_id: string;
      name: string;
      type: string;
      start_time: string;
      duration: number;
      videographers: string[];
    }> = [];

    const momentMap = new Map<string, {
      moment_id: string;
      name: string;
      type: string;
      start_time: string;
      duration: number;
      videographers: Set<string>;
    }>();

    for (const videographer of weddingManifest.videographers) {
      const momentIndexKey = `${wedding_id}/videographers/${videographer.id}/indices/content/moments/index.json.gz`;
      const momentIndexObj = await env.R2_BUCKET.get(momentIndexKey);

      if (!momentIndexObj) {
        continue;
      }

      const momentIndex = parseManifest<MomentIndex>(
        await momentIndexObj.text()
      );

      for (const [moment_id, moment] of Object.entries(momentIndex.moments)) {
        // Filter by type if specified
        if (moment_type && moment.moment_type !== moment_type) {
          continue;
        }

        if (!momentMap.has(moment_id)) {
          momentMap.set(moment_id, {
            moment_id,
            name: moment.name,
            type: moment.moment_type,
            start_time: moment.start_time,
            duration: moment.duration,
            videographers: new Set([videographer.id])
          });
        } else {
          momentMap.get(moment_id)!.videographers.add(videographer.id);
        }
      }
    }

    // Convert to array
    momentMap.forEach(moment => {
      allMoments.push({
        ...moment,
        videographers: Array.from(moment.videographers)
      });
    });

    // Sort by start time
    allMoments.sort((a, b) =>
      new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

    return jsonResponse({
      wedding_id,
      moment_type: moment_type || 'all',
      moments: allMoments
    });

  } catch (error) {
    console.error('Moment list error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, max-age=300', // Cache for 5 minutes
    }
  });
}
