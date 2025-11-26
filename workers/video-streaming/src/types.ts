/**
 * Type definitions for video-streaming worker
 */

export interface VideoStreamingEnv {
  R2_BUCKET: R2Bucket;  // Private bucket only
  VIDEO_CACHE: KVNamespace;
  DB: D1Database;
  // R2 signing credentials (for private bucket pre-signed URLs)
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_REGION?: string;
  R2_BUCKET_NAME?: string;
  R2_ACCOUNT_ID?: string;
  // Authentication (shared with viewer worker)
  GALLERY_PASSWORD?: string;
  AUTH_SECRET?: string;
  DISABLE_AUTH?: string; // Disable auth entirely (for local dev - set to "true")
}
