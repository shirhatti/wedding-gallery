-- Fix production schema to match Prisma migration
-- This removes bad DEFAULT 'CURRENT_TIMESTAMP' and makes processed_at nullable

-- Step 1: Create new media table with correct schema
CREATE TABLE media_new (
    key TEXT NOT NULL PRIMARY KEY,
    filename TEXT NOT NULL,
    type TEXT NOT NULL,
    size INTEGER,
    uploaded_at TEXT,
    date_taken TEXT,
    camera_make TEXT,
    camera_model TEXT,
    lens TEXT,
    focal_length REAL,
    aperture REAL,
    shutter_speed REAL,
    iso INTEGER,
    latitude REAL,
    longitude REAL,
    altitude REAL,
    duration REAL,
    codec TEXT,
    width INTEGER,
    height INTEGER,
    hls_qualities TEXT,
    thumbnail_small TEXT,
    thumbnail_medium TEXT,
    thumbnail_large TEXT,
    metadata TEXT,
    processed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- Step 2: Copy all data from old table
INSERT INTO media_new
SELECT
    key, filename, type, size, uploaded_at, date_taken, camera_make, camera_model,
    lens, focal_length, aperture, shutter_speed, iso, latitude, longitude, altitude,
    duration, codec, width, height, hls_qualities, thumbnail_small, thumbnail_medium,
    thumbnail_large, metadata,
    -- Convert 'CURRENT_TIMESTAMP' literals to NULL for processed_at
    CASE
        WHEN processed_at = 'CURRENT_TIMESTAMP' THEN NULL
        ELSE processed_at
    END,
    -- Keep created_at and updated_at (or set to uploaded_at if they're bad)
    CASE
        WHEN created_at = 'CURRENT_TIMESTAMP' THEN COALESCE(uploaded_at, datetime('now'))
        ELSE created_at
    END,
    CASE
        WHEN updated_at = 'CURRENT_TIMESTAMP' THEN COALESCE(uploaded_at, datetime('now'))
        ELSE updated_at
    END
FROM media;

-- Step 3: Replace old table
DROP TABLE media;
ALTER TABLE media_new RENAME TO media;

-- Step 4: Fix pending_thumbnails if needed
CREATE TABLE pending_thumbnails_new (
    key TEXT NOT NULL PRIMARY KEY,
    created_at TEXT NOT NULL
);

INSERT INTO pending_thumbnails_new
SELECT
    key,
    CASE
        WHEN created_at = 'CURRENT_TIMESTAMP' THEN datetime('now')
        ELSE created_at
    END
FROM pending_thumbnails;

DROP TABLE pending_thumbnails;
ALTER TABLE pending_thumbnails_new RENAME TO pending_thumbnails;
