/**
 * HLS (HTTP Live Streaming) conversion utility
 * Converts videos to adaptive bitrate HLS format with multiple quality levels
 */

import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from '@ffmpeg-installer/ffmpeg';
import { writeFile, mkdir, readdir, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// Configure ffmpeg
ffmpeg.setFfmpegPath(ffmpegPath.path);

/**
 * HLS quality presets for adaptive streaming
 */
const HLS_PRESETS = [
  {
    name: '1080p',
    resolution: '1920x1080',
    videoBitrate: '5000k',
    audioBitrate: '128k',
    maxrate: '5350k',
    bufsize: '7500k'
  },
  {
    name: '720p',
    resolution: '1280x720',
    videoBitrate: '2800k',
    audioBitrate: '128k',
    maxrate: '2996k',
    bufsize: '4200k'
  },
  {
    name: '480p',
    resolution: '854x480',
    videoBitrate: '1400k',
    audioBitrate: '96k',
    maxrate: '1498k',
    bufsize: '2100k'
  },
  {
    name: '360p',
    resolution: '640x360',
    videoBitrate: '800k',
    audioBitrate: '96k',
    maxrate: '856k',
    bufsize: '1200k'
  }
];

/**
 * Get video metadata (resolution, duration, etc.)
 */
export async function getVideoMetadata(videoBuffer) {
  const tempVideoPath = join(tmpdir(), `probe-${Date.now()}.mp4`);

  try {
    await writeFile(tempVideoPath, videoBuffer);

    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(tempVideoPath, (err, metadata) => {
        // Clean up temp file
        rm(tempVideoPath).catch(() => {});

        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video');
        resolve({
          width: videoStream?.width || 0,
          height: videoStream?.height || 0,
          duration: metadata.format.duration || 0,
          bitrate: metadata.format.bit_rate || 0
        });
      });
    });
  } catch (error) {
    await rm(tempVideoPath).catch(() => {});
    throw error;
  }
}

/**
 * Determine which quality presets to use based on source video resolution
 */
function selectQualityPresets(sourceWidth, sourceHeight) {
  const sourceResolution = sourceHeight;

  // Only generate qualities equal to or lower than source
  return HLS_PRESETS.filter(preset => {
    const targetHeight = parseInt(preset.resolution.split('x')[1]);
    return targetHeight <= sourceResolution;
  });
}

/**
 * Convert a single video to a specific HLS quality level
 */
async function convertToHLSQuality(videoPath, outputDir, preset) {
  return new Promise((resolve, reject) => {
    const playlistName = `${preset.name}.m3u8`;
    const segmentPattern = `${preset.name}_%03d.ts`;

    ffmpeg(videoPath)
      .outputOptions([
        '-c:v libx264',           // Video codec
        '-c:a aac',               // Audio codec
        '-preset fast',           // Encoding speed
        '-profile:v main',        // H.264 profile
        `-s ${preset.resolution}`, // Scale to resolution
        `-b:v ${preset.videoBitrate}`,
        `-maxrate ${preset.maxrate}`,
        `-bufsize ${preset.bufsize}`,
        `-b:a ${preset.audioBitrate}`,
        '-sc_threshold 0',        // Disable scene detection
        '-g 48',                  // GOP size (2 seconds at 24fps)
        '-keyint_min 48',
        '-hls_time 4',            // Segment duration
        '-hls_playlist_type vod', // Video on demand
        '-hls_segment_filename', join(outputDir, segmentPattern)
      ])
      .output(join(outputDir, playlistName))
      .on('end', () => resolve())
      .on('error', (err) => reject(err))
      .run();
  });
}

/**
 * Create master playlist that references all quality levels
 */
async function createMasterPlaylist(outputDir, presets, metadata) {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3'];

  for (const preset of presets) {
    const bandwidth = parseInt(preset.videoBitrate) * 1000 + parseInt(preset.audioBitrate) * 1000;
    const resolution = preset.resolution;

    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${resolution}`,
      `${preset.name}.m3u8`
    );
  }

  const masterPlaylist = lines.join('\n');
  await writeFile(join(outputDir, 'master.m3u8'), masterPlaylist);
}

/**
 * Convert video to HLS format with adaptive bitrate streaming
 * Returns object with all HLS files (playlists and segments)
 */
export async function convertToHLS(videoBuffer) {
  const tempVideoPath = join(tmpdir(), `video-${Date.now()}.mp4`);
  const outputDir = join(tmpdir(), `hls-${Date.now()}`);

  try {
    // Create temp directories
    await mkdir(outputDir, { recursive: true });
    await writeFile(tempVideoPath, videoBuffer);

    // Get video metadata to determine appropriate quality levels
    const metadata = await getVideoMetadata(videoBuffer);
    console.log(`  Source resolution: ${metadata.width}x${metadata.height}, duration: ${metadata.duration.toFixed(1)}s`);

    // Select quality presets based on source resolution
    const selectedPresets = selectQualityPresets(metadata.width, metadata.height);
    console.log(`  Generating ${selectedPresets.length} quality levels: ${selectedPresets.map(p => p.name).join(', ')}`);

    // Convert to each quality level
    for (const preset of selectedPresets) {
      console.log(`  Converting to ${preset.name}...`);
      await convertToHLSQuality(tempVideoPath, outputDir, preset);
    }

    // Create master playlist
    await createMasterPlaylist(outputDir, selectedPresets, metadata);

    // Read all generated files
    const files = await readdir(outputDir);
    const hlsFiles = {};

    for (const file of files) {
      const filePath = join(outputDir, file);
      const content = await readFile(filePath);
      hlsFiles[file] = content;
    }

    // Clean up
    await rm(tempVideoPath).catch(() => {});
    await rm(outputDir, { recursive: true }).catch(() => {});

    return {
      files: hlsFiles,
      metadata,
      qualityLevels: selectedPresets.map(p => p.name)
    };
  } catch (error) {
    // Clean up on error
    await rm(tempVideoPath).catch(() => {});
    await rm(outputDir, { recursive: true }).catch(() => {});
    throw error;
  }
}

/**
 * Upload HLS files to R2 under a video key prefix
 */
export async function uploadHLSToR2(worker, videoKey, hlsFiles) {
  const uploadPromises = [];

  for (const [filename, buffer] of Object.entries(hlsFiles)) {
    const contentType = filename.endsWith('.m3u8')
      ? 'application/vnd.apple.mpegurl'
      : 'video/MP2T';

    const r2Key = `hls/${videoKey}/${filename}`;

    uploadPromises.push(
      worker.fetch('http://localhost/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          key: r2Key,
          data: buffer.toString('base64'),
          contentType
        }),
      }).then(resp => {
        if (!resp.ok) {
          throw new Error(`Failed to upload ${r2Key}`);
        }
      })
    );
  }

  await Promise.all(uploadPromises);
}
