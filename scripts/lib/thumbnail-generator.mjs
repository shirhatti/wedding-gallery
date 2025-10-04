/**
 * Shared thumbnail generation utility for images and videos
 * Reduces code duplication across scripts (DRY principle)
 */

import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import exifr from 'exifr';

// Configure ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath.path);

/**
 * Upload buffer to R2 via worker
 */
export async function uploadToR2(worker, key, buffer, contentType = 'image/webp') {
  const resp = await worker.fetch('http://localhost/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      key,
      data: buffer.toString('base64'),
      contentType
    }),
  });

  if (!resp.ok) {
    throw new Error(`Failed to upload ${key}`);
  }
}

/**
 * Extract a frame from a video file as a thumbnail
 */
export async function extractVideoThumbnail(videoBuffer) {
  // Write buffer to temp file
  const tempVideoPath = join(tmpdir(), `video-${Date.now()}.mp4`);
  const tempImagePath = join(tmpdir(), `thumb-${Date.now()}.png`);

  try {
    await writeFile(tempVideoPath, videoBuffer);

    // Extract frame at 1 second (or 10% through the video, whichever is earlier)
    await new Promise((resolve, reject) => {
      ffmpeg(tempVideoPath)
        .screenshots({
          timestamps: ['1'],
          filename: tempImagePath.split('/').pop(),
          folder: tmpdir(),
          size: '1920x1080'
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // Read the extracted frame
    const frameBuffer = await sharp(tempImagePath).toBuffer();

    // Clean up temp files
    await unlink(tempVideoPath).catch(() => {});
    await unlink(tempImagePath).catch(() => {});

    return frameBuffer;
  } catch (error) {
    // Clean up on error
    await unlink(tempVideoPath).catch(() => {});
    await unlink(tempImagePath).catch(() => {});
    throw error;
  }
}

/**
 * Generate thumbnails for an image
 */
export async function generateImageThumbnails(buffer) {
  // Generate thumbnails (rotate() auto-rotates based on EXIF orientation)
  const [small, medium, large] = await Promise.all([
    sharp(buffer).rotate().resize(150, 150, { fit: 'cover' }).webp({ quality: 80 }).toBuffer(),
    sharp(buffer).rotate().resize(400, 400, { fit: 'cover' }).webp({ quality: 85 }).toBuffer(),
    sharp(buffer).rotate().resize(800, 800, { fit: 'inside' }).webp({ quality: 90 }).toBuffer(),
  ]);

  return { small, medium, large };
}

/**
 * Generate thumbnails for a video by extracting a frame
 */
export async function generateVideoThumbnails(videoBuffer) {
  // Extract a frame from the video
  const frameBuffer = await extractVideoThumbnail(videoBuffer);

  // Generate thumbnails from the extracted frame (no rotation needed for video frames)
  const [small, medium, large] = await Promise.all([
    sharp(frameBuffer).resize(150, 150, { fit: 'cover' }).webp({ quality: 80 }).toBuffer(),
    sharp(frameBuffer).resize(400, 400, { fit: 'cover' }).webp({ quality: 85 }).toBuffer(),
    sharp(frameBuffer).resize(800, 800, { fit: 'inside' }).webp({ quality: 90 }).toBuffer(),
  ]);

  return { small, medium, large };
}

/**
 * Generate thumbnails for any media type (image or video)
 */
export async function generateThumbnails(buffer, mediaType) {
  if (mediaType === 'video') {
    return await generateVideoThumbnails(buffer);
  } else {
    return await generateImageThumbnails(buffer);
  }
}

/**
 * Upload all thumbnail sizes to R2
 */
export async function uploadThumbnails(worker, key, thumbnails) {
  await Promise.all([
    uploadToR2(worker, `thumbnails/small/${key}`, thumbnails.small),
    uploadToR2(worker, `thumbnails/medium/${key}`, thumbnails.medium),
    uploadToR2(worker, `thumbnails/large/${key}`, thumbnails.large),
  ]);
}

/**
 * Extract EXIF metadata from an image buffer
 */
export async function extractExifMetadata(buffer) {
  try {
    const exif = await exifr.parse(buffer, {
      pick: ['DateTimeOriginal', 'Make', 'Model', 'LensModel',
             'FocalLength', 'FNumber', 'ExposureTime', 'ISO',
             'latitude', 'longitude', 'GPSAltitude']
    });
    return exif;
  } catch (e) {
    // No EXIF data or error parsing
    return null;
  }
}
