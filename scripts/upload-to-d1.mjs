import Database from 'better-sqlite3';
import { execSync } from 'child_process';
import fs from 'fs';

const db = new Database('wedding-photos-metadata.db');
const BATCH_SIZE = 50;

// Get all media records
const allMedia = db.prepare(`
  SELECT key, filename, type, size, uploaded_at, date_taken, camera_make, camera_model,
         lens, focal_length, aperture, shutter_speed, iso, latitude, longitude, altitude,
         duration, codec, width, height, metadata, processed_at, created_at, updated_at
  FROM media
`).all();

console.log(`Found ${allMedia.length} media records to upload`);

// Process in batches
for (let i = 0; i < allMedia.length; i += BATCH_SIZE) {
  const batch = allMedia.slice(i, i + BATCH_SIZE);
  console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(allMedia.length / BATCH_SIZE)}...`);

  // Create SQL for this batch
  const values = batch.map(row => {
    const escape = (val) => val ? `'${val.replace(/'/g, "''")}'` : 'NULL';
    return `(${escape(row.key)}, ${escape(row.filename)}, ${escape(row.type)}, ${row.size}, ${escape(row.uploaded_at)}, ${escape(row.date_taken)}, ${escape(row.camera_make)}, ${escape(row.camera_model)}, ${escape(row.lens)}, ${row.focal_length || 'NULL'}, ${row.aperture || 'NULL'}, ${row.shutter_speed || 'NULL'}, ${row.iso || 'NULL'}, ${row.latitude || 'NULL'}, ${row.longitude || 'NULL'}, ${row.altitude || 'NULL'}, ${row.duration || 'NULL'}, ${escape(row.codec)}, ${row.width || 'NULL'}, ${row.height || 'NULL'}, ${escape(row.metadata)}, ${escape(row.processed_at)}, ${escape(row.created_at)}, ${escape(row.updated_at)})`;
  }).join(',\n');

  const sql = `INSERT INTO media (key, filename, type, size, uploaded_at, date_taken, camera_make, camera_model, lens, focal_length, aperture, shutter_speed, iso, latitude, longitude, altitude, duration, codec, width, height, metadata, processed_at, created_at, updated_at) VALUES ${values};`;

  // Write to temp file
  fs.writeFileSync('/tmp/batch.sql', sql);

  // Execute via wrangler
  try {
    execSync('cd workers/viewer && npx wrangler d1 execute wedding-photos-metadata --file=/tmp/batch.sql --remote', { stdio: 'inherit' });
  } catch (error) {
    console.error(`Error processing batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error);
    process.exit(1);
  }
}

// Clean up
fs.unlinkSync('/tmp/batch.sql');

console.log('Upload complete!');
db.close();
