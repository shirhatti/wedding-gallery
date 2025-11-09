/**
 * Shared thumbnail generation utility for images and videos
 * Reduces code duplication across scripts (DRY principle)
 */

import sharp from 'sharp';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import exifr from 'exifr';
import convert from 'heic-convert';
import { execFileSync } from 'child_process';

// Use system ffmpeg/ffprobe (installed in CI via AnimMouse/setup-ffmpeg)
const FFMPEG_CMD = 'ffmpeg';
const FFPROBE_CMD = 'ffprobe';

// ---------- Helper utilities ----------
const SCALE_FILTER = 'scale=1920:-2:force_original_aspect_ratio=decrease';

function buildFfprobeJsonArgs(videoPath) {
  return [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    videoPath,
  ];
}

function buildExtractFrameArgs(videoPath, seekTimestamp, outputImagePath) {
  return [
    '-ss', String(seekTimestamp),
    '-i', videoPath,
    '-frames:v', '1',
    '-vf', SCALE_FILTER,
    '-y',
    outputImagePath,
  ];
}

function parseFfprobeJson(output) {
  try {
    return JSON.parse(output);
  } catch (e) {
    throw new Error('extractVideoMetadata: failed to parse ffprobe JSON');
  }
}

function logStderr(prefix, error) {
  try {
    const stderr = error && error.stderr ? error.stderr.toString() : '';
    if (stderr) {
      console.error(`${prefix}:`, stderr);
    } else if (error && error.message) {
      console.error(`${prefix}:`, error.message);
    } else if (error) {
      console.error(`${prefix}:`, String(error));
    }
  } catch {
    // best-effort logging only
  }
}

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
 * Extract metadata from video file (creation time, dimensions, etc.)
 */
export async function extractVideoMetadata(videoBuffer) {
  const tempVideoPath = join(tmpdir(), `probe-${Date.now()}.mp4`);

  try {
    await writeFile(tempVideoPath, videoBuffer);
    // Probe using ffprobe with JSON output (no shell)
    let output;
    try {
      output = execFileSync(FFPROBE_CMD, buildFfprobeJsonArgs(tempVideoPath), {
        encoding: 'utf8',
        stdio: 'pipe',
      });
    } catch (error) {
      logStderr('ffprobe error in extractVideoMetadata', error);
      throw new Error('extractVideoMetadata: ffprobe failed');
    } finally {
      await Promise.allSettled([
        unlink(tempVideoPath),
      ]);
    }

    const metadata = parseFfprobeJson(output);
    const creationTime = metadata.format?.tags?.creation_time || null;

    // Extract dimensions from video stream
    const videoStream = metadata.streams?.find(s => s.codec_type === 'video');
    const width = videoStream?.width || null;
    const height = videoStream?.height || null;

    return {
      creation_time: creationTime,
      duration: parseFloat(metadata.format?.duration || 0) || 0,
      width,
      height,
      metadata
    };
  } catch (error) {
    throw error;
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

    // Determine safe seek timestamp (handle short videos <1s gracefully)
    let durationSeconds = 0;
    try {
      const probeOut = execFileSync(FFPROBE_CMD, buildFfprobeJsonArgs(tempVideoPath), {
        encoding: 'utf8',
        stdio: 'pipe',
      });
      const probe = parseFfprobeJson(probeOut);
      durationSeconds = parseFloat(probe.format?.duration || 0) || 0;
    } catch (error) {
      logStderr('ffprobe error in extractVideoThumbnail (duration probe)', error);
      durationSeconds = 0;
    }

    const seekTs = durationSeconds >= 1 ? '1' : (durationSeconds > 0 ? (durationSeconds / 2).toFixed(3) : '0');

    // Extract frame at chosen timestamp (preserving aspect ratio, max width 1920)
    try {
      execFileSync(FFMPEG_CMD, buildExtractFrameArgs(tempVideoPath, seekTs, tempImagePath), {
        stdio: 'pipe',
      });
    } catch (error) {
      logStderr('ffmpeg error in extractVideoThumbnail', error);
      throw new Error('extractVideoThumbnail: ffmpeg failed');
    }

    // Read the extracted frame
    const frameBuffer = await sharp(tempImagePath).toBuffer();

    // Clean up temp files (best-effort)
    await Promise.allSettled([
      unlink(tempVideoPath),
      unlink(tempImagePath),
    ]);

    return frameBuffer;
  } catch (error) {
    // Clean up on error (best-effort)
    await Promise.allSettled([
      unlink(tempVideoPath),
      unlink(tempImagePath),
    ]);
    throw error;
  }
}

/**
 * Generate thumbnails for an image
 */
export async function generateImageThumbnails(buffer, filename = '') {
  let processBuffer = buffer;

  // Convert HEIC to JPEG first if needed
  if (filename.toLowerCase().endsWith('.heic')) {
    console.log('  Converting HEIC to JPEG...');
    processBuffer = Buffer.from(await convert({
      buffer: buffer,
      format: 'JPEG',
      quality: 0.95
    }));
  }

  // Generate thumbnails (rotate() auto-rotates based on EXIF orientation)
  // Use 'inside' fit to preserve aspect ratios for natural-looking masonry layout
  const [small, medium, large] = await Promise.all([
    sharp(processBuffer).rotate().resize(150, 150, { fit: 'inside' }).webp({ quality: 80 }).toBuffer(),
    sharp(processBuffer).rotate().resize(400, 400, { fit: 'inside' }).webp({ quality: 85 }).toBuffer(),
    sharp(processBuffer).rotate().resize(800, 800, { fit: 'inside' }).webp({ quality: 90 }).toBuffer(),
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
  // Use 'inside' fit to preserve aspect ratios for natural-looking masonry layout
  const [small, medium, large] = await Promise.all([
    sharp(frameBuffer).resize(150, 150, { fit: 'inside' }).webp({ quality: 80 }).toBuffer(),
    sharp(frameBuffer).resize(400, 400, { fit: 'inside' }).webp({ quality: 85 }).toBuffer(),
    sharp(frameBuffer).resize(800, 800, { fit: 'inside' }).webp({ quality: 90 }).toBuffer(),
  ]);

  return { small, medium, large };
}

/**
 * Generate thumbnails for any media type (image or video)
 */
export async function generateThumbnails(buffer, mediaType, filename = '') {
  if (mediaType === 'video') {
    return await generateVideoThumbnails(buffer);
  } else {
    return await generateImageThumbnails(buffer, filename);
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
 * Extract EXIF metadata from an image buffer (including dimensions)
 */
export async function extractExifMetadata(buffer) {
  try {
    const exif = await exifr.parse(buffer, {
      pick: ['DateTimeOriginal', 'Make', 'Model', 'LensModel',
             'FocalLength', 'FNumber', 'ExposureTime', 'ISO',
             'latitude', 'longitude', 'GPSAltitude', 'ImageWidth', 'ImageHeight']
    });
    return exif;
  } catch (e) {
    // No EXIF data or error parsing
    return null;
  }
}

/**
 * Extract dimensions from image buffer using sharp
 */
export async function extractImageDimensions(buffer) {
  try {
    const metadata = await sharp(buffer).metadata();
    return {
      width: metadata.width || null,
      height: metadata.height || null
    };
  } catch (e) {
    return { width: null, height: null };
  }
}
