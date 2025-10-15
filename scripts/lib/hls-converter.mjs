/**
 * HLS (HTTP Live Streaming) conversion utility
 * Converts videos to adaptive bitrate HLS format with multiple quality levels
 */

import { writeFile, mkdir, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { execSync } from 'child_process';

// Use system ffmpeg/ffprobe which supports modern codecs
// GitHub Actions workflow uses AnimMouse/setup-ffmpeg to install a modern version
const FFMPEG_CMD = 'ffmpeg';
const FFPROBE_CMD = 'ffprobe';

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

    const output = execSync(
      `${FFPROBE_CMD} -v error -print_format json -show_format -show_streams "${tempVideoPath}"`,
      { encoding: 'utf8' }
    );

    // Clean up temp file
    await rm(tempVideoPath).catch(() => {});

    const metadata = JSON.parse(output);
    const videoStream = metadata.streams.find(s => s.codec_type === 'video');

    return {
      width: videoStream?.width || 0,
      height: videoStream?.height || 0,
      duration: parseFloat(metadata.format.duration) || 0,
      bitrate: parseInt(metadata.format.bit_rate) || 0
    };
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
  const selected = HLS_PRESETS.filter(preset => {
    const targetHeight = parseInt(preset.resolution.split('x')[1]);
    return targetHeight <= sourceResolution;
  });

  // If no presets match (video is very low res), create a preset for the source resolution
  if (selected.length === 0) {
    return [{
      name: `${sourceHeight}p`,
      resolution: `${sourceWidth}x${sourceHeight}`,
      videoBitrate: '800k',
      audioBitrate: '96k',
      maxrate: '856k',
      bufsize: '1200k'
    }];
  }

  return selected;
}

/**
 * Convert a single video to a specific HLS quality level
 */
async function convertToHLSQuality(videoPath, outputDir, preset) {
  const playlistName = `${preset.name}.m3u8`;
  const segmentPattern = `${preset.name}_%03d.ts`;

  // Extract target height from preset resolution
  const targetHeight = parseInt(preset.resolution.split('x')[1]);

  // Use scale filter to preserve aspect ratio
  // Scale based on height, width auto-calculated (-2 ensures even number)
  const scaleFilter = `scale=-2:${targetHeight}`;

  const ffmpegArgs = [
    '-i', videoPath,
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-pix_fmt', 'yuv420p',
    '-preset', 'fast',
    '-profile:v', 'main',
    '-vf', scaleFilter,
    '-b:v', preset.videoBitrate,
    '-maxrate', preset.maxrate,
    '-bufsize', preset.bufsize,
    '-b:a', preset.audioBitrate,
    '-sc_threshold', '0',
    '-g', '48',
    '-keyint_min', '48',
    '-hls_time', '4',
    '-hls_playlist_type', 'vod',
    '-hls_segment_filename', join(outputDir, segmentPattern),
    join(outputDir, playlistName)
  ];

  try {
    execSync(`${FFMPEG_CMD} ${ffmpegArgs.map(arg => `"${arg}"`).join(' ')}`, {
      stdio: 'pipe',
      encoding: 'utf8'
    });
  } catch (error) {
    console.error('  ffmpeg stderr:', error.stderr);
    throw new Error(`ffmpeg error: ${error.message}`);
  }
}

/**
 * Create master playlist that references all quality levels
 */
async function createMasterPlaylist(outputDir, presets, metadata) {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3'];

  // Calculate actual output resolutions preserving aspect ratio
  const aspectRatio = metadata.width / metadata.height;

  for (const preset of presets) {
    const bandwidth = parseInt(preset.videoBitrate) * 1000 + parseInt(preset.audioBitrate) * 1000;

    // Calculate actual width based on target height and source aspect ratio
    const targetHeight = parseInt(preset.resolution.split('x')[1]);
    const actualWidth = Math.round(targetHeight * aspectRatio);
    // Ensure even number (required for H.264)
    const evenWidth = actualWidth % 2 === 0 ? actualWidth : actualWidth - 1;
    const actualResolution = `${evenWidth}x${targetHeight}`;

    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${actualResolution}`,
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

    // Clean up temp video file only (keep outputDir for upload)
    await rm(tempVideoPath).catch(() => {});

    return {
      outputDir,
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
 * Upload HLS files to R2 under a video key prefix using wrangler CLI
 */
export async function uploadHLSToR2(videoKey, outputDir) {
  const files = await readdir(outputDir);

  for (const filename of files) {
    const localPath = join(outputDir, filename);
    const r2Key = `hls/${videoKey}/${filename}`;
    const contentType = filename.endsWith('.m3u8')
      ? 'application/vnd.apple.mpegurl'
      : 'video/MP2T';

    execSync(`npx wrangler r2 object put "wedding-photos/${r2Key}" --file="${localPath}" --content-type="${contentType}" --remote`, {
      cwd: 'workers/viewer',
      stdio: 'inherit'
    });
  }
}
