-- Add CHECK constraint to ensure hls_qualities is always valid JSON
-- Note: SQLite doesn't support adding constraints to existing columns directly,
-- so we need to check if future inserts/updates use the json() function

-- Create a trigger to validate JSON on INSERT
CREATE TRIGGER IF NOT EXISTS validate_hls_qualities_insert
BEFORE INSERT ON media
FOR EACH ROW
WHEN NEW.hls_qualities IS NOT NULL AND json_valid(NEW.hls_qualities) = 0
BEGIN
    SELECT RAISE(ABORT, 'hls_qualities must be valid JSON');
END;

-- Create a trigger to validate JSON on UPDATE
CREATE TRIGGER IF NOT EXISTS validate_hls_qualities_update
BEFORE UPDATE OF hls_qualities ON media
FOR EACH ROW
WHEN NEW.hls_qualities IS NOT NULL AND json_valid(NEW.hls_qualities) = 0
BEGIN
    SELECT RAISE(ABORT, 'hls_qualities must be valid JSON');
END;
