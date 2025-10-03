// Main processor logic for EXIF extraction and thumbnail generation
import * as exifr from 'exifr';
import { 
  getUnprocessedMedia, 
  markAsProcessing, 
  saveMediaMetadata, 
  markAsCompleted, 
  markAsFailed 
} from './database';

export async function processNewMedia(env) {
  console.log('Starting media processing...');
  
  try {
    // First, scan R2 for new files
    await scanForNewFiles(env);
    
    // Then process pending items
    const pending = await getUnprocessedMedia(env);
    console.log(`Found ${pending.length} items to process`);
    
    const results = {
      processed: 0,
      failed: 0,
      errors: []
    };
    
    for (const item of pending) {
      try {
        await markAsProcessing(env, item.key);
        await processMediaItem(env, item.key);
        await markAsCompleted(env, item.key);
        results.processed++;
      } catch (error) {
        console.error(`Failed to process ${item.key}:`, error);
        await markAsFailed(env, item.key, error.message);
        results.failed++;
        results.errors.push({ key: item.key, error: error.message });
      }
    }
    
    return results;
  } catch (error) {
    console.error('Processing error:', error);
    throw error;
  }
}

async function scanForNewFiles(env) {
  // List all files in R2
  const list = await env.R2_BUCKET.list({ limit: 1000 });
  
  for (const obj of list.objects) {
    const key = obj.key.toLowerCase();
    
    // Check if this is a media file
    const isMedia = isImageFile(key) || isVideoFile(key);
    if (!isMedia) continue;
    
    // Check if already in cache
    const cached = await env.PROCESS_CACHE.get(obj.key);
    if (cached) continue;
    
    // Add to processing queue
    try {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO process_queue (key, status)
        VALUES (?, 'pending')
      `).bind(obj.key).run();
      
      console.log(`Added ${obj.key} to processing queue`);
    } catch (error) {
      console.error(`Failed to add ${obj.key} to queue:`, error);
    }
  }
}

async function processMediaItem(env, key) {
  console.log(`Processing ${key}...`);
  
  // Get the file from R2
  const object = await env.R2_BUCKET.get(key);
  if (!object) {
    throw new Error('File not found in R2');
  }
  
  const metadata = {
    key: key,
    filename: key.split('/').pop(),
    type: isVideoFile(key) ? 'video' : 'image',
    size: object.size,
    uploaded_at: object.uploaded
  };
  
  // Process based on type
  if (metadata.type === 'image') {
    await processImage(env, object, metadata);
  } else {
    await processVideo(env, object, metadata);
  }
  
  // Save metadata to database
  await saveMediaMetadata(env, metadata);
  
  // Mark as processed in cache
  await env.PROCESS_CACHE.put(key, 'processed', { 
    expirationTtl: 60 * 60 * 24 * 30 // 30 days
  });
}

async function processImage(env, object, metadata) {
  try {
    // Get image data
    const arrayBuffer = await object.arrayBuffer();
    
    // Extract EXIF data
    const exif = await exifr.parse(arrayBuffer, {
      // Specify which tags we want
      pick: ['DateTimeOriginal', 'Make', 'Model', 'LensModel', 
             'FocalLength', 'FNumber', 'ExposureTime', 'ISO',
             'GPSLatitude', 'GPSLongitude', 'GPSAltitude']
    });
    
    if (exif) {
      metadata.date_taken = exif.DateTimeOriginal;
      metadata.camera_make = exif.Make;
      metadata.camera_model = exif.Model;
      metadata.lens = exif.LensModel;
      metadata.focal_length = exif.FocalLength;
      metadata.aperture = exif.FNumber;
      metadata.shutter_speed = exif.ExposureTime;
      metadata.iso = exif.ISO;
      metadata.latitude = exif.GPSLatitude;
      metadata.longitude = exif.GPSLongitude;
      metadata.altitude = exif.GPSAltitude;
      
      // Store full EXIF as JSON
      metadata.metadata = exif;
    }
    
    // Generate thumbnails (if using Cloudflare Images)
    // await generateThumbnails(env, object, metadata);
    
  } catch (error) {
    console.error('EXIF extraction failed:', error);
    // Continue even if EXIF fails
  }
}

async function processVideo(env, object, metadata) {
  // Basic video processing
  // For now, just store basic info
  // In future, could extract frame for thumbnail
  
  metadata.duration = null; // Would need video processing library
  metadata.codec = 'unknown';
  
  // You could use FFmpeg via WebAssembly or external API for more details
}

async function generateThumbnails(env, object, metadata) {
  // This would use Cloudflare Images API or a WebAssembly image processor
  // For now, we'll just store references to the original
  
  // Example with Cloudflare Images (requires setup):
  // const imageId = await uploadToCloudflareImages(env, object);
  // metadata.thumbnail_small = `${imageId}/thumbnail`;
  // metadata.thumbnail_medium = `${imageId}/public`;
  // metadata.thumbnail_large = `${imageId}/original`;
  
  // Placeholder for now
  metadata.thumbnail_small = `/api/file/${metadata.key}`;
  metadata.thumbnail_medium = `/api/file/${metadata.key}`;
  metadata.thumbnail_large = `/api/file/${metadata.key}`;
}

// Helper functions
function isImageFile(key) {
  return /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(key);
}

function isVideoFile(key) {
  return /\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(key);
}
