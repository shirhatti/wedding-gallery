/**
 * Index Builder Utilities
 * Build time-based and content-based indexes for video segments
 */

import { BloomFilter } from './bloom-filter';
import { CountMinSketch } from './count-min-sketch';
import type {
  TimeIndex,
  PersonIndex,
  MomentIndex,
  SegmentReference,
  PersonEntity,
  PersonAppearance,
  MomentEntity
} from './types/manifests';

// ============================================================================
// Time-Based Index Builder
// ============================================================================

export interface SegmentInput {
  id: string;
  sequence: number;
  start_time: string;
  end_time: string;
  duration: number;
  uri: string;
  byte_size?: number;
  has_motion: boolean;
  has_audio: boolean;
  face_count?: number;
  thumbnail_uri?: string;
  moment_id?: string;
}

/**
 * Build a time-based index from segments
 */
export function buildTimeIndex(
  videographer_id: string,
  segments: SegmentInput[],
  wedding_id?: string
): TimeIndex {
  const segmentRefs: SegmentReference[] = segments.map(seg => ({
    id: seg.id,
    sequence: seg.sequence,
    time_range: {
      start: seg.start_time,
      end: seg.end_time
    },
    duration: seg.duration,
    uri: seg.uri,
    byte_size: seg.byte_size,
    has_motion: seg.has_motion,
    has_audio: seg.has_audio,
    detection_summary: seg.face_count ? { faces: seg.face_count } : undefined,
    thumbnail_uri: seg.thumbnail_uri,
    moment_id: seg.moment_id
  }));

  return {
    version: '1.0',
    videographer_id,
    wedding_id,
    target_duration: 60,
    segments: segmentRefs.sort((a, b) => a.sequence - b.sequence)
  };
}

/**
 * Find segments in a time range
 */
export function findSegmentsInTimeRange(
  index: TimeIndex,
  start: Date,
  end: Date
): SegmentReference[] {
  const startTime = start.getTime();
  const endTime = end.getTime();

  return index.segments.filter(seg => {
    const segStart = new Date(seg.time_range.start).getTime();
    const segEnd = new Date(seg.time_range.end).getTime();

    // Check if segment overlaps with time range
    return segStart < endTime && segEnd > startTime;
  });
}

// ============================================================================
// Content Index Builder - People
// ============================================================================

export interface PersonAppearanceInput {
  person_id: string;
  segment_id: string;
  start_time: string;
  end_time: string;
  start_offset: number;
  end_offset: number;
  frame_count: number;
  confidence_avg: number;
  confidence_min: number;
  thumbnail_uri?: string;
}

/**
 * Build a person index from appearances
 */
export function buildPersonIndex(
  videographer_id: string,
  appearances: PersonAppearanceInput[],
  wedding_id?: string
): PersonIndex {
  // Group appearances by person
  const entitiesMap = new Map<string, PersonEntity>();

  for (const app of appearances) {
    let entity = entitiesMap.get(app.person_id);

    if (!entity) {
      entity = {
        person_id: app.person_id,
        first_seen: app.start_time,
        last_seen: app.end_time,
        total_frames: 0,
        total_duration_seconds: 0,
        appearances: []
      };
      entitiesMap.set(app.person_id, entity);
    }

    // Update entity stats
    entity.last_seen = app.end_time;
    entity.total_frames += app.frame_count;
    entity.total_duration_seconds += (app.end_offset - app.start_offset);

    // Add appearance
    const appearance: PersonAppearance = {
      segment_id: app.segment_id,
      time_range: {
        start: app.start_time,
        end: app.end_time
      },
      frame_count: app.frame_count,
      confidence_avg: app.confidence_avg,
      confidence_min: app.confidence_min,
      thumbnail_uri: app.thumbnail_uri
    };

    entity.appearances.push(appearance);
  }

  // Convert map to object
  const entities: Record<string, PersonEntity> = {};
  entitiesMap.forEach((entity, person_id) => {
    entities[person_id] = entity;
  });

  const totalAppearances = appearances.length;

  return {
    version: '1.0',
    videographer_id,
    wedding_id,
    content_type: 'people',
    updated_at: new Date().toISOString(),
    entities,
    stats: {
      unique_entities: entitiesMap.size,
      total_appearances: totalAppearances
    }
  };
}

/**
 * Build a bloom filter for people in the index
 */
export function buildPeopleBloomFilter(
  personIndex: PersonIndex,
  fpRate: number = 0.01
): BloomFilter {
  const personIds = Object.keys(personIndex.entities);
  const filter = new BloomFilter(Math.max(personIds.length, 100), fpRate);

  for (const person_id of personIds) {
    filter.add(person_id);
  }

  return filter;
}

/**
 * Build a count-min sketch for person appearance frequency
 */
export function buildPeopleSketch(
  personIndex: PersonIndex,
  width: number = 10000,
  depth: number = 5
): CountMinSketch {
  const sketch = new CountMinSketch(width, depth);

  for (const [person_id, entity] of Object.entries(personIndex.entities)) {
    sketch.add(person_id, entity.appearances.length);
  }

  return sketch;
}

// ============================================================================
// Content Index Builder - Moments
// ============================================================================

export interface MomentInput {
  moment_id: string;
  name: string;
  moment_type: 'preparation' | 'ceremony' | 'reception_event' | 'portrait' | 'candid';
  start_time: string;
  end_time: string;
  duration: number;
  segments: string[];
  people_featured?: string[];
  tags?: string[];
  thumbnail_uri?: string;
}

/**
 * Build a moment index from moment data
 */
export function buildMomentIndex(
  videographer_id: string,
  moments: MomentInput[],
  wedding_id?: string
): MomentIndex {
  const momentsMap: Record<string, MomentEntity> = {};

  for (const moment of moments) {
    momentsMap[moment.moment_id] = {
      moment_id: moment.moment_id,
      name: moment.name,
      moment_type: moment.moment_type,
      start_time: moment.start_time,
      end_time: moment.end_time,
      duration: moment.duration,
      segments: moment.segments,
      people_featured: moment.people_featured,
      tags: moment.tags,
      thumbnail_uri: moment.thumbnail_uri
    };
  }

  return {
    version: '1.0',
    videographer_id,
    wedding_id,
    content_type: 'moments',
    updated_at: new Date().toISOString(),
    moments: momentsMap
  };
}

/**
 * Build a bloom filter for moments in the index
 */
export function buildMomentsBloomFilter(
  momentIndex: MomentIndex,
  fpRate: number = 0.01
): BloomFilter {
  const momentIds = Object.keys(momentIndex.moments);
  const filter = new BloomFilter(Math.max(momentIds.length, 100), fpRate);

  for (const moment_id of momentIds) {
    filter.add(moment_id);

    // Also add tags for tag-based searching
    const moment = momentIndex.moments[moment_id];
    if (moment.tags) {
      for (const tag of moment.tags) {
        filter.add(tag);
      }
    }
  }

  return filter;
}

// ============================================================================
// Index Merge Utilities
// ============================================================================

/**
 * Merge multiple person indexes (e.g., from different videographers)
 */
export function mergePersonIndexes(indexes: PersonIndex[]): PersonIndex {
  if (indexes.length === 0) {
    throw new Error('Cannot merge empty list of indexes');
  }

  const merged: PersonIndex = {
    version: '1.0',
    videographer_id: 'global',
    content_type: 'people',
    updated_at: new Date().toISOString(),
    entities: {},
    stats: {
      unique_entities: 0,
      total_appearances: 0
    }
  };

  // Merge entities
  for (const index of indexes) {
    for (const [person_id, entity] of Object.entries(index.entities)) {
      if (!merged.entities[person_id]) {
        merged.entities[person_id] = {
          person_id,
          first_seen: entity.first_seen,
          last_seen: entity.last_seen,
          total_frames: 0,
          total_duration_seconds: 0,
          appearances: []
        };
      }

      const mergedEntity = merged.entities[person_id];
      mergedEntity.total_frames += entity.total_frames;
      mergedEntity.total_duration_seconds += entity.total_duration_seconds;
      mergedEntity.appearances.push(...entity.appearances);

      // Update time range
      if (new Date(entity.first_seen) < new Date(mergedEntity.first_seen)) {
        mergedEntity.first_seen = entity.first_seen;
      }
      if (new Date(entity.last_seen) > new Date(mergedEntity.last_seen)) {
        mergedEntity.last_seen = entity.last_seen;
      }
    }
  }

  // Update stats
  merged.stats.unique_entities = Object.keys(merged.entities).length;
  merged.stats.total_appearances = Object.values(merged.entities).reduce(
    (sum, entity) => sum + entity.appearances.length,
    0
  );

  return merged;
}

/**
 * Filter person index by confidence threshold
 */
export function filterByConfidence(
  index: PersonIndex,
  minConfidence: number
): PersonIndex {
  const filtered: PersonIndex = {
    ...index,
    entities: {},
    updated_at: new Date().toISOString()
  };

  for (const [person_id, entity] of Object.entries(index.entities)) {
    const filteredAppearances = entity.appearances.filter(
      app => app.confidence_avg >= minConfidence
    );

    if (filteredAppearances.length > 0) {
      filtered.entities[person_id] = {
        ...entity,
        appearances: filteredAppearances,
        total_frames: filteredAppearances.reduce((sum, app) => sum + app.frame_count, 0)
      };
    }
  }

  filtered.stats.unique_entities = Object.keys(filtered.entities).length;
  filtered.stats.total_appearances = Object.values(filtered.entities).reduce(
    (sum, entity) => sum + entity.appearances.length,
    0
  );

  return filtered;
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Find all segments where a person appears
 */
export function findPersonSegments(
  index: PersonIndex,
  person_id: string
): string[] {
  const entity = index.entities[person_id];
  if (!entity) {
    return [];
  }

  return entity.appearances.map(app => app.segment_id);
}

/**
 * Find all people in a segment
 */
export function findPeopleInSegment(
  index: PersonIndex,
  segment_id: string
): string[] {
  const people: string[] = [];

  for (const [person_id, entity] of Object.entries(index.entities)) {
    const hasSegment = entity.appearances.some(app => app.segment_id === segment_id);
    if (hasSegment) {
      people.push(person_id);
    }
  }

  return people;
}

/**
 * Get top N people by appearance frequency
 */
export function getTopPeople(
  index: PersonIndex,
  n: number
): Array<{ person_id: string; appearance_count: number }> {
  const people = Object.entries(index.entities).map(([person_id, entity]) => ({
    person_id,
    appearance_count: entity.appearances.length
  }));

  return people
    .sort((a, b) => b.appearance_count - a.appearance_count)
    .slice(0, n);
}
