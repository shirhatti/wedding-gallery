// Database operations for metadata storage
export async function initDatabase(env) {
  // This will be run once to set up the database schema
  // The actual schema is in schema.sql which should be run via wrangler
  console.log('Database initialized');
}

export async function getUnprocessedMedia(env) {
  const result = await env.DB.prepare(`
    SELECT key FROM process_queue 
    WHERE status = 'pending' 
    LIMIT 10
  `).all();
  
  return result.results || [];
}

export async function markAsProcessing(env, key) {
  await env.DB.prepare(`
    UPDATE process_queue 
    SET status = 'processing', updated_at = CURRENT_TIMESTAMP 
    WHERE key = ?
  `).bind(key).run();
}

export async function saveMediaMetadata(env, metadata) {
  const stmt = env.DB.prepare(`
    INSERT INTO media (
      key, filename, type, size, uploaded_at,
      date_taken, camera_make, camera_model, lens,
      focal_length, aperture, shutter_speed, iso,
      latitude, longitude, altitude,
      duration, width, height, codec,
      thumbnail_small, thumbnail_medium, thumbnail_large,
      metadata
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      date_taken = excluded.date_taken,
      camera_make = excluded.camera_make,
      camera_model = excluded.camera_model,
      processed_at = CURRENT_TIMESTAMP
  `);
  
  await stmt.bind(
    metadata.key,
    metadata.filename,
    metadata.type,
    metadata.size,
    metadata.uploaded_at,
    metadata.date_taken,
    metadata.camera_make,
    metadata.camera_model,
    metadata.lens,
    metadata.focal_length,
    metadata.aperture,
    metadata.shutter_speed,
    metadata.iso,
    metadata.latitude,
    metadata.longitude,
    metadata.altitude,
    metadata.duration,
    metadata.width,
    metadata.height,
    metadata.codec,
    metadata.thumbnail_small,
    metadata.thumbnail_medium,
    metadata.thumbnail_large,
    JSON.stringify(metadata.metadata || {})
  ).run();
}

export async function markAsCompleted(env, key) {
  await env.DB.prepare(`
    UPDATE process_queue 
    SET status = 'completed', updated_at = CURRENT_TIMESTAMP 
    WHERE key = ?
  `).bind(key).run();
}

export async function markAsFailed(env, key, error) {
  await env.DB.prepare(`
    UPDATE process_queue 
    SET status = 'failed', error = ?, attempts = attempts + 1, updated_at = CURRENT_TIMESTAMP 
    WHERE key = ?
  `).bind(error, key).run();
}
