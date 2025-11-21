/**
 * TypeScript types for video storage manifests and indexes
 * Wedding Gallery Video Architecture
 */

// ============================================================================
// Wedding Manifest Types
// ============================================================================

export interface WeddingManifest {
  version: string;
  wedding_id: string;
  wedding_name: string;
  wedding_date: string; // ISO 8601 date
  location?: string;
  videographers: VideographerInfo[];
  timeline: WeddingTimeline;
  key_people: KeyPerson[];
  retention_policy?: RetentionPolicy;
  index_config?: IndexConfig;
}

export interface VideographerInfo {
  id: string;
  name: string;
  operator?: string;
  role: 'primary' | 'guest' | 'drone' | 'backup';
  manifest_uri?: string;
  status?: 'active' | 'offline' | 'completed';
  capabilities?: string[];
}

export interface WeddingTimeline {
  ceremony_start?: string; // ISO 8601 timestamp
  ceremony_end?: string;
  reception_start?: string;
  reception_end?: string;
  [key: string]: string | undefined; // Allow custom timeline markers
}

export interface KeyPerson {
  id: string;
  name: string;
  role: 'bride' | 'groom' | 'maid_of_honor' | 'best_man' | 'bridesmaid' | 'groomsman' | 'parent' | 'officiant' | 'guest';
}

export interface RetentionPolicy {
  raw_video_days: number;
  indexes_days: number;
  moments_days: number;
}

export interface IndexConfig {
  bloom_filter_fp_rate: number;
  segment_duration_seconds: number;
  detection_models?: string[];
}

// ============================================================================
// Videographer Manifest Types
// ============================================================================

export interface VideographerManifest {
  version: string;
  videographer_id: string;
  wedding_id: string;
  updated_at: string;
  indices: VideographerIndices;
  stats: VideographerStats;
}

export interface VideographerIndices {
  time: TimeIndices;
  content: ContentIndices;
}

export interface TimeIndices {
  live?: string; // URI to live index
  full?: IndexReference; // Full timeline
}

export interface IndexReference {
  uri: string;
  updated_at: string;
}

export interface ContentIndices {
  bloom: {
    people?: string;
    moments?: string;
    global?: string;
  };
  sketches?: string;
  people?: string;
  moments?: string;
  transcript?: string;
}

export interface VideographerStats {
  total_segments: number;
  total_duration_hours: number;
  unique_people_detected?: number;
  moments_captured?: number;
}

// ============================================================================
// Time Index Types
// ============================================================================

export interface TimeIndex {
  version: string;
  videographer_id: string;
  wedding_id?: string;
  target_duration: number; // Segment duration in seconds
  segments: SegmentReference[];
  gaps?: VideoGap[];
}

export interface SegmentReference {
  id: string;
  sequence: number;
  time_range: TimeRange;
  duration: number;
  uri: string;
  byte_size?: number;
  has_motion: boolean;
  has_audio: boolean;
  detection_summary?: DetectionSummary;
  thumbnail_uri?: string;
  moment_id?: string;
}

export interface TimeRange {
  start: string; // ISO 8601 timestamp
  end: string;
}

export interface DetectionSummary {
  faces?: number;
  persons?: number;
  objects?: number;
}

export interface VideoGap {
  start: string;
  end: string;
  reason: 'camera_offline' | 'battery_dead' | 'storage_full' | 'manual_stop' | 'unknown';
}

// ============================================================================
// Segment Manifest Types
// ============================================================================

export interface SegmentManifest {
  version: string;
  segment_id: string;
  videographer_id: string;
  wedding_id?: string;
  sequence: number;
  time_range: TimeRange;
  duration: number;
  variants: VideoVariants;
  keyframes?: KeyframeInfo;
  detections?: DetectionInfo;
  thumbnail_uri: string;
  moment_id?: string;
}

export interface VideoVariants {
  full: VideoVariant;
  low?: VideoVariant;
  audio_only?: AudioVariant;
}

export interface VideoVariant {
  uri: string;
  codec: string;
  resolution?: string; // e.g., "1920x1080"
  bitrate: number;
  byte_size: number;
}

export interface AudioVariant {
  uri: string;
  codec: string;
  bitrate: number;
  byte_size: number;
}

export interface KeyframeInfo {
  interval: number; // Seconds between keyframes
  uris: string[];
}

export interface DetectionInfo {
  uri: string; // URI to detections.json.gz
  summary: {
    people?: PersonDetectionSummary[];
    moments?: string[];
    audio?: AudioSummary;
  };
}

export interface PersonDetectionSummary {
  id: string;
  name?: string;
  frame_count: number;
  confidence_avg: number;
}

export interface AudioSummary {
  has_speech: boolean;
  speech_duration_seconds?: number;
  noise_level_db?: number;
  transcript_available?: boolean;
}

// ============================================================================
// Content Index Types
// ============================================================================

export interface PersonIndex {
  version: string;
  videographer_id: string;
  wedding_id?: string;
  content_type: 'people';
  updated_at: string;
  entities: Record<string, PersonEntity>;
  stats: {
    unique_entities: number;
    total_appearances: number;
  };
}

export interface PersonEntity {
  person_id: string;
  name?: string;
  role?: string;
  first_seen: string;
  last_seen: string;
  total_frames: number;
  total_duration_seconds: number;
  appearances: PersonAppearance[];
  co_occurrences?: Record<string, number>; // person_id -> count
}

export interface PersonAppearance {
  segment_id: string;
  time_range: TimeRange;
  frame_count: number;
  confidence_avg: number;
  confidence_min: number;
  bbox_samples?: BoundingBoxSample[];
  thumbnail_uri?: string;
}

export interface BoundingBoxSample {
  time: number; // Offset in seconds from appearance start
  bbox: [number, number, number, number]; // [x, y, width, height] normalized 0-1
}

export interface MomentIndex {
  version: string;
  videographer_id: string;
  wedding_id?: string;
  content_type: 'moments';
  updated_at: string;
  moments: Record<string, MomentEntity>;
}

export interface MomentEntity {
  moment_id: string;
  name: string;
  moment_type: 'preparation' | 'ceremony' | 'reception_event' | 'portrait' | 'candid';
  start_time: string;
  end_time: string;
  duration: number;
  segments: string[]; // Segment IDs
  people_featured?: string[]; // Person IDs
  tags?: string[];
  thumbnail_uri?: string;
}

// ============================================================================
// Global Index Types
// ============================================================================

export interface GlobalPersonIndex {
  version: string;
  wedding_id: string;
  entity_id: string;
  entity_type: 'person';
  created_at: string;
  last_seen: string;
  total_appearances: number;
  videographers_seen: string[];
  appearances: GlobalPersonAppearance[];
  daily_summary?: Record<string, DailySummary>;
}

export interface GlobalPersonAppearance {
  videographer_id: string;
  timestamp: string;
  segment_id: string;
  confidence: number;
  thumbnail_uri?: string;
}

export interface DailySummary {
  first_seen: string;
  last_seen: string;
  videographers: string[];
  appearance_count: number;
}

export interface GlobalMomentIndex {
  version: string;
  wedding_id: string;
  moment_id: string;
  name: string;
  moment_type: string;
  start_time: string;
  end_time: string;
  duration: number;
  videographers: MomentVideographerInfo[];
  people_featured?: string[];
  tags?: string[];
}

export interface MomentVideographerInfo {
  videographer_id: string;
  segments: string[];
  angle?: string; // 'front', 'side', 'back', 'overhead'
  quality?: string; // '4K', '1080p', '720p'
}

// ============================================================================
// Bloom Filter Types
// ============================================================================

export interface BloomFilterMetadata {
  magic: number; // 0x424C4F4D
  version: number;
  size_bits: number;
  num_hashes: number;
  num_items: number;
}

// ============================================================================
// Count-Min Sketch Types
// ============================================================================

export interface CountMinSketchMetadata {
  magic: number; // 0x434D5348
  version: number;
  width: number;
  depth: number;
  total_count: number;
}

// ============================================================================
// Query Response Types
// ============================================================================

export interface PersonSearchResult {
  person_id: string;
  name?: string;
  results: VideographerPersonResults[];
  total_clips: number;
  total_duration_seconds: number;
  search_time_ms?: number;
}

export interface VideographerPersonResults {
  videographer_id: string;
  videographer_name: string;
  appearances: AppearanceResult[];
}

export interface AppearanceResult {
  segment_id: string;
  timestamp: string;
  duration: number;
  thumbnail?: string;
  moment?: string;
  hls_url?: string;
}

export interface MomentSearchResult {
  moment_id: string;
  name: string;
  start_time: string;
  end_time: string;
  angles: MomentAngleResult[];
  people_featured?: string[];
  tags?: string[];
}

export interface MomentAngleResult {
  videographer_id: string;
  videographer_name: string;
  angle?: string;
  segments: SegmentResult[];
}

export interface SegmentResult {
  segment_id: string;
  start: string;
  duration: number;
  hls_url?: string;
  thumbnail?: string;
}

export interface TimelineSearchResult {
  time_range: TimeRange;
  videographers: VideographerTimelineResult[];
  total_segments: number;
  total_duration: number;
}

export interface VideographerTimelineResult {
  videographer_id: string;
  videographer_name: string;
  segments: SegmentResult[];
}
