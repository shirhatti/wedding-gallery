/**
 * Admin Worker
 * Handles admin operations like copying media between buckets
 */

interface Env {
  R2_BUCKET_PRIVATE: R2Bucket;
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return new Response("Admin Worker - Not deployed to production yet", {
      headers: { "Content-Type": "text/plain" }
    });
  },
};
