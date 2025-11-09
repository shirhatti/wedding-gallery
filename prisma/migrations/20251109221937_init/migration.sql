-- CreateTable
CREATE TABLE "media" (
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
    "processed_at" TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
    "created_at" TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP',
    "updated_at" TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);

-- CreateTable
CREATE TABLE "pending_thumbnails" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "created_at" TEXT NOT NULL DEFAULT 'CURRENT_TIMESTAMP'
);
