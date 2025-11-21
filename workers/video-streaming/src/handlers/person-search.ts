/**
 * Person Search Handler
 * Find all appearances of a person across videographers
 */

import { checkBloomFilter, parseManifest } from '@wedding-gallery/shared-video-lib';
import type {
  PersonSearchResult,
  VideographerPersonResults,
  AppearanceResult,
  WeddingManifest,
  PersonIndex
} from '@wedding-gallery/shared-video-lib';
import type { VideoStreamingEnv } from '../types';

/**
 * Handle person search query
 * GET /api/video/search/person?person_id=xxx&wedding_id=xxx
 */
export async function handlePersonSearch(
  request: Request,
  env: VideoStreamingEnv
): Promise<Response> {
  const startTime = Date.now();
  const url = new URL(request.url);
  const person_id = url.searchParams.get('person_id');
  const wedding_id = url.searchParams.get('wedding_id') || 'default';

  if (!person_id) {
    return new Response(
      JSON.stringify({ error: 'Missing person_id parameter' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Step 1: Check global bloom filter for quick negative
    const globalBloomKey = `${wedding_id}/global/bloom/people-global.bloom`;
    const globalBloom = await env.R2_BUCKET.get(globalBloomKey);

    if (globalBloom) {
      const bloomData = await globalBloom.arrayBuffer();
      const mightExist = await checkBloomFilter(bloomData, person_id);

      if (!mightExist) {
        // Person definitely not in any footage
        return jsonResponse({
          person_id,
          results: [],
          total_clips: 0,
          total_duration_seconds: 0,
          search_time_ms: Date.now() - startTime,
          message: 'Person not found in any footage'
        });
      }
    }

    // Step 2: Get wedding manifest to list all videographers
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

    // Step 3: Check bloom filters for each videographer in parallel
    const videographerChecks = await Promise.all(
      weddingManifest.videographers.map(async (videographer) => {
        const bloomKey = `${wedding_id}/videographers/${videographer.id}/indices/content/bloom/people.bloom`;
        const bloom = await env.R2_BUCKET.get(bloomKey);

        if (!bloom) {
          return { videographer, hasMatch: false };
        }

        const bloomData = await bloom.arrayBuffer();
        const mightContain = await checkBloomFilter(bloomData, person_id);

        return { videographer, hasMatch: mightContain };
      })
    );

    const matchingVideographers = videographerChecks.filter(c => c.hasMatch);

    // Step 4: Fetch person indexes for matching videographers
    const results: VideographerPersonResults[] = [];
    let totalClips = 0;
    let totalDuration = 0;

    await Promise.all(
      matchingVideographers.map(async ({ videographer }) => {
        const indexKey = `${wedding_id}/videographers/${videographer.id}/indices/content/people/index.json.gz`;
        const indexObj = await env.R2_BUCKET.get(indexKey);

        if (!indexObj) {
          return;
        }

        // TODO: Handle gzip decompression
        const indexText = await indexObj.text();
        const personIndex = parseManifest<PersonIndex>(indexText);

        const entity = personIndex.entities[person_id];
        if (!entity) {
          return;
        }

        // Build appearance results
        const appearances: AppearanceResult[] = entity.appearances.map(app => ({
          segment_id: app.segment_id,
          timestamp: app.time_range.start,
          duration: app.frame_count / 30, // Assuming 30fps
          thumbnail: app.thumbnail_uri,
          moment: undefined, // TODO: Look up moment from segment
          hls_url: `/api/hls/${wedding_id}/videographers/${videographer.id}/segments/${app.segment_id}/playlist.m3u8`
        }));

        totalClips += appearances.length;
        totalDuration += entity.total_duration_seconds;

        results.push({
          videographer_id: videographer.id,
          videographer_name: videographer.name,
          appearances
        });
      })
    );

    // Return results
    const response: PersonSearchResult = {
      person_id,
      results,
      total_clips: totalClips,
      total_duration_seconds: totalDuration,
      search_time_ms: Date.now() - startTime
    };

    return jsonResponse(response);

  } catch (error) {
    console.error('Person search error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

/**
 * Handle person list query
 * GET /api/video/people?wedding_id=xxx
 */
export async function handlePersonList(
  request: Request,
  env: VideoStreamingEnv
): Promise<Response> {
  const url = new URL(request.url);
  const wedding_id = url.searchParams.get('wedding_id') || 'default';

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

    // Return key people from manifest
    return jsonResponse({
      wedding_id,
      people: weddingManifest.key_people
    });

  } catch (error) {
    console.error('Person list error:', error);
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
