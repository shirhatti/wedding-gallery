-- Create new table without bad defaults
CREATE TABLE media_new (
    -- ... (copy all columns from migration.sql but with correct types)
);

-- Copy data
INSERT INTO media_new SELECT * FROM media;

-- Swap tables
DROP TABLE media;
ALTER TABLE media_new RENAME TO media;

-- Same for pending_thumbnails if needed
