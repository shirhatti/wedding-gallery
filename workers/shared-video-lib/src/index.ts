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
