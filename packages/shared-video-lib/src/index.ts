/**
 * Shared video library for HLS streaming
 * Provides R2 signing, M3U8 handling, and progressive delivery
 */

// R2 Signing
export { signR2Url, getSigningConfig } from "./r2-signer";
export type { SigningConfig, R2SigningEnv } from "./r2-signer";

// Cached URL signing
export { getCachedSignedUrl, isVideoSigningEnabled } from "./cached-url-signer";

// Batch signing
export { batchSignR2Urls, batchSignWithCache } from "./batch-r2-signer";

// Optimized batch signing
export { batchSignWithCachedKey, ultraOptimizedBatchSign } from "./optimized-batch-signer";

// M3U8 handling
export {
  rewriteMasterPlaylist,
  rewriteMediaPlaylist,
  rewritePlaylist,
  batchRewriteMediaPlaylist
} from "./m3u8-handler";
export type { M3U8RewriteOptions } from "./m3u8-handler";

// Progressive manifest delivery
export { generateProgressiveManifest, generateLazyManifest } from "./progressive-manifest";
export type { ProgressiveManifestOptions } from "./progressive-manifest";

// Video Content Storage & Query System
export { BloomFilter, createBloomFilter, checkBloomFilter } from "./bloom-filter";
export { CountMinSketch, createCountMinSketch, estimateFromSketch, calculateOptimalDimensions } from "./count-min-sketch";

// Manifest builders
export {
  createWeddingManifest,
  createVideographerManifest,
  createSegmentManifest,
  createTimeIndex,
  createPersonIndex,
  createMomentIndex,
  createGlobalPersonIndex,
  createGlobalMomentIndex,
  serializeManifest,
  parseManifest,
  getManifestKey
} from "./manifest-builder";

// Index builders
export {
  buildTimeIndex,
  findSegmentsInTimeRange,
  buildPersonIndex,
  buildPeopleBloomFilter,
  buildPeopleSketch,
  buildMomentIndex,
  buildMomentsBloomFilter,
  mergePersonIndexes,
  filterByConfidence,
  findPersonSegments,
  findPeopleInSegment,
  getTopPeople
} from "./index-builder";
export type { SegmentInput, PersonAppearanceInput, MomentInput } from "./index-builder";

// Manifest types
export type * from "./types/manifests";
