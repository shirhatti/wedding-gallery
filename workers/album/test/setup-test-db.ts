/**
 * Initialize test database with schema from Prisma migrations
 * Call this in beforeAll() hooks for E2E tests
 *
 * This SQL is copied from prisma/migrations/
 */
export async function setupTestDatabase(db: D1Database): Promise<void> {
  // Create media table
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS "media" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "filename" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "size" INTEGER,
      "uploaded_at" TEXT,
      "date_taken" TEXT,
      "camera_make" TEXT,
      "camera_model" TEXT,
      "lens" TEXT,
      "focal_length" REAL,
      "aperture" REAL,
      "shutter_speed" REAL,
      "iso" INTEGER,
      "latitude" REAL,
      "longitude" REAL,
      "altitude" REAL,
      "duration" REAL,
      "codec" TEXT,
      "width" INTEGER,
      "height" INTEGER,
      "hls_qualities" TEXT,
      "thumbnail_small" TEXT,
      "thumbnail_medium" TEXT,
      "thumbnail_large" TEXT,
      "metadata" TEXT,
      "is_public" INTEGER NOT NULL DEFAULT 0,
      "processed_at" TEXT,
      "created_at" TEXT NOT NULL,
      "updated_at" TEXT NOT NULL
    )
  `).run();

  // Create pending_thumbnails table
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS "pending_thumbnails" (
      "key" TEXT NOT NULL PRIMARY KEY,
      "created_at" TEXT NOT NULL
    )
  `).run();
}
