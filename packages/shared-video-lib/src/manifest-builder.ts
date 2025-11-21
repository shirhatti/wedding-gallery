/**
 * Manifest Builder Utilities
 * Generate manifests for the wedding video storage hierarchy
 */

import type {
  WeddingManifest,
  VideographerManifest,
  SegmentManifest,
  TimeIndex,
  PersonIndex,
  MomentIndex,
  GlobalPersonIndex,
  GlobalMomentIndex,
  VideographerInfo,
  KeyPerson,
  SegmentReference,
  PersonEntity,
  MomentEntity
} from './types/manifests';

/**
 * Create a new wedding manifest
 */
export function createWeddingManifest(params: {
  wedding_id: string;
  wedding_name: string;
  wedding_date: string;
  location?: string;
  videographers: VideographerInfo[];
  key_people: KeyPerson[];
}): WeddingManifest {
  return {
    version: '1.0',
    wedding_id: params.wedding_id,
    wedding_name: params.wedding_name,
    wedding_date: params.wedding_date,
    location: params.location,
    videographers: params.videographers,
    timeline: {},
    key_people: params.key_people,
    retention_policy: {
      raw_video_days: 90,
      indexes_days: 365,
      moments_days: 730
    },
    index_config: {
      bloom_filter_fp_rate: 0.01,
      segment_duration_seconds: 60
    }
  };
}

/**
 * Create a videographer manifest
 */
export function createVideographerManifest(params: {
  videographer_id: string;
  wedding_id: string;
  total_segments: number;
  total_duration_hours: number;
}): VideographerManifest {
  return {
    version: '1.0',
    videographer_id: params.videographer_id,
    wedding_id: params.wedding_id,
    updated_at: new Date().toISOString(),
    indices: {
      time: {
        full: {
          uri: `videographers/${params.videographer_id}/indices/time/timeline.json.gz`,
          updated_at: new Date().toISOString()
        }
      },
      content: {
        bloom: {
          people: `videographers/${params.videographer_id}/indices/content/bloom/people.bloom`,
          moments: `videographers/${params.videographer_id}/indices/content/bloom/moments.bloom`,
          global: `videographers/${params.videographer_id}/indices/content/bloom/global.bloom`
        },
        sketches: `videographers/${params.videographer_id}/indices/content/sketches/counts.cms`,
        people: `videographers/${params.videographer_id}/indices/content/people/index.json.gz`,
        moments: `videographers/${params.videographer_id}/indices/content/moments/index.json.gz`
      }
    },
    stats: {
      total_segments: params.total_segments,
      total_duration_hours: params.total_duration_hours
    }
  };
}

/**
 * Create a segment manifest
 */
export function createSegmentManifest(params: {
  segment_id: string;
  videographer_id: string;
  wedding_id?: string;
  sequence: number;
  start_time: string;
  end_time: string;
  duration: number;
  video_uri: string;
  thumbnail_uri: string;
  moment_id?: string;
}): SegmentManifest {
  const basePath = `videographers/${params.videographer_id}/segments/${params.segment_id}`;

  return {
    version: '1.0',
    segment_id: params.segment_id,
    videographer_id: params.videographer_id,
    wedding_id: params.wedding_id,
    sequence: params.sequence,
    time_range: {
      start: params.start_time,
      end: params.end_time
    },
    duration: params.duration,
    variants: {
      full: {
        uri: params.video_uri,
        codec: 'h264',
        resolution: '1920x1080',
        bitrate: 4000000,
        byte_size: 0 // Will be filled when uploaded
      }
    },
    thumbnail_uri: params.thumbnail_uri,
    moment_id: params.moment_id
  };
}

/**
 * Create a time-based index for a videographer
 */
export function createTimeIndex(params: {
  videographer_id: string;
  wedding_id?: string;
  segments: SegmentReference[];
  target_duration?: number;
}): TimeIndex {
  return {
    version: '1.0',
    videographer_id: params.videographer_id,
    wedding_id: params.wedding_id,
    target_duration: params.target_duration || 60,
    segments: params.segments.sort((a, b) => a.sequence - b.sequence)
  };
}

/**
 * Create a person index for a videographer
 */
export function createPersonIndex(params: {
  videographer_id: string;
  wedding_id?: string;
  entities: Record<string, PersonEntity>;
}): PersonIndex {
  const totalAppearances = Object.values(params.entities).reduce(
    (sum, entity) => sum + entity.appearances.length,
    0
  );

  return {
    version: '1.0',
    videographer_id: params.videographer_id,
    wedding_id: params.wedding_id,
    content_type: 'people',
    updated_at: new Date().toISOString(),
    entities: params.entities,
    stats: {
      unique_entities: Object.keys(params.entities).length,
      total_appearances: totalAppearances
    }
  };
}

/**
 * Create a moment index for a videographer
 */
export function createMomentIndex(params: {
  videographer_id: string;
  wedding_id?: string;
  moments: Record<string, MomentEntity>;
}): MomentIndex {
  return {
    version: '1.0',
    videographer_id: params.videographer_id,
    wedding_id: params.wedding_id,
    content_type: 'moments',
    updated_at: new Date().toISOString(),
    moments: params.moments
  };
}

/**
 * Create a global person index (cross-videographer)
 */
export function createGlobalPersonIndex(params: {
  wedding_id: string;
  entity_id: string;
  appearances: Array<{
    videographer_id: string;
    timestamp: string;
    segment_id: string;
    confidence: number;
    thumbnail_uri?: string;
  }>;
}): GlobalPersonIndex {
  const videographersSeen = [...new Set(params.appearances.map(a => a.videographer_id))];

  return {
    version: '1.0',
    wedding_id: params.wedding_id,
    entity_id: params.entity_id,
    entity_type: 'person',
    created_at: params.appearances[0]?.timestamp || new Date().toISOString(),
    last_seen: params.appearances[params.appearances.length - 1]?.timestamp || new Date().toISOString(),
    total_appearances: params.appearances.length,
    videographers_seen: videographersSeen,
    appearances: params.appearances
  };
}

/**
 * Create a global moment index (multi-angle)
 */
export function createGlobalMomentIndex(params: {
  wedding_id: string;
  moment_id: string;
  name: string;
  moment_type: string;
  start_time: string;
  end_time: string;
  duration: number;
  videographers: Array<{
    videographer_id: string;
    segments: string[];
    angle?: string;
    quality?: string;
  }>;
  people_featured?: string[];
  tags?: string[];
}): GlobalMomentIndex {
  return {
    version: '1.0',
    wedding_id: params.wedding_id,
    moment_id: params.moment_id,
    name: params.name,
    moment_type: params.moment_type,
    start_time: params.start_time,
    end_time: params.end_time,
    duration: params.duration,
    videographers: params.videographers,
    people_featured: params.people_featured,
    tags: params.tags
  };
}

/**
 * Helper to serialize manifest to JSON with compression metadata
 */
export function serializeManifest(manifest: unknown): string {
  return JSON.stringify(manifest, null, 2);
}

/**
 * Helper to parse manifest from JSON
 */
export function parseManifest<T>(json: string): T {
  return JSON.parse(json) as T;
}

/**
 * Generate R2 key for a manifest
 */
export function getManifestKey(params: {
  type: 'wedding' | 'videographer' | 'segment' | 'time' | 'person' | 'moment' | 'global_person' | 'global_moment';
  wedding_id?: string;
  videographer_id?: string;
  segment_id?: string;
  person_id?: string;
  moment_id?: string;
}): string {
  const { type, wedding_id, videographer_id, segment_id, person_id, moment_id } = params;

  switch (type) {
    case 'wedding':
      return `${wedding_id}/manifest.json`;
    case 'videographer':
      return `${wedding_id}/videographers/${videographer_id}/manifest.json`;
    case 'segment':
      return `${wedding_id}/videographers/${videographer_id}/segments/${segment_id}/manifest.json`;
    case 'time':
      return `${wedding_id}/videographers/${videographer_id}/indices/time/timeline.json.gz`;
    case 'person':
      return `${wedding_id}/videographers/${videographer_id}/indices/content/people/index.json.gz`;
    case 'moment':
      return `${wedding_id}/videographers/${videographer_id}/indices/content/moments/index.json.gz`;
    case 'global_person':
      return `${wedding_id}/global/people/${person_id}.json`;
    case 'global_moment':
      return `${wedding_id}/global/moments/${moment_id}.json`;
    default:
      throw new Error(`Unknown manifest type: ${type}`);
  }
}
