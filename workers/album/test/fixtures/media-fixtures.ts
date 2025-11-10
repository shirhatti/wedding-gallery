/**
 * Test fixtures for media records
 * Provides sample data for comprehensive e2e testing
 */

import { Prisma } from '@prisma/client';

export interface MediaFixture {
  key: string;
  filename: string;
  type: 'image' | 'video';
  size: number;
  uploadedAt: Date;
  dateTaken?: Date;
  cameraMake?: string;
  cameraModel?: string;
  lens?: string;
  focalLength?: number;
  aperture?: number;
  shutterSpeed?: number;
  iso?: number;
  latitude?: number;
  longitude?: number;
  altitude?: number;
  width?: number;
  height?: number;
  thumbnailSmall?: string;
  thumbnailMedium?: string;
  thumbnailLarge?: string;
  metadata?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Base date for test fixtures (fixed date for consistency)
 */
const baseDate = new Date('2024-06-15T14:30:00Z');

/**
 * Sample EXIF metadata for testing
 */
export const sampleExifMetadata = {
  Canon5D: {
    make: 'Canon',
    model: 'Canon EOS 5D Mark IV',
    lens: 'EF24-70mm f/2.8L II USM',
    focalLength: 50,
    aperture: 2.8,
    shutterSpeed: 0.004, // 1/250
    iso: 400,
  },
  Sony7: {
    make: 'Sony',
    model: 'Sony A7 III',
    lens: 'FE 85mm F1.8',
    focalLength: 85,
    aperture: 1.8,
    shutterSpeed: 0.002, // 1/500
    iso: 200,
  },
  iPhone: {
    make: 'Apple',
    model: 'iPhone 14 Pro',
    lens: 'iPhone 14 Pro back triple camera 6.86mm f/1.78',
    focalLength: 6.86,
    aperture: 1.78,
    shutterSpeed: 0.001, // 1/1000
    iso: 100,
  },
};

/**
 * Sample GPS coordinates for testing
 */
export const sampleLocations = {
  sanFrancisco: {
    latitude: 37.7749,
    longitude: -122.4194,
    altitude: 16,
  },
  newYork: {
    latitude: 40.7128,
    longitude: -74.0060,
    altitude: 10,
  },
  paris: {
    latitude: 48.8566,
    longitude: 2.3522,
    altitude: 35,
  },
};

/**
 * Creates a complete media fixture with all fields
 */
export function createImageFixture(overrides: Partial<MediaFixture> = {}): MediaFixture {
  const timestamp = Date.now();
  const key = overrides.key || `test-image-${timestamp}.jpg`;
  const now = new Date();

  return {
    key,
    filename: overrides.filename || 'test-wedding-photo.jpg',
    type: 'image',
    size: overrides.size || 2048576, // 2MB
    uploadedAt: overrides.uploadedAt || now,
    dateTaken: overrides.dateTaken || baseDate,
    cameraMake: overrides.cameraMake || sampleExifMetadata.Canon5D.make,
    cameraModel: overrides.cameraModel || sampleExifMetadata.Canon5D.model,
    lens: overrides.lens || sampleExifMetadata.Canon5D.lens,
    focalLength: overrides.focalLength || sampleExifMetadata.Canon5D.focalLength,
    aperture: overrides.aperture || sampleExifMetadata.Canon5D.aperture,
    shutterSpeed: overrides.shutterSpeed || sampleExifMetadata.Canon5D.shutterSpeed,
    iso: overrides.iso || sampleExifMetadata.Canon5D.iso,
    latitude: overrides.latitude,
    longitude: overrides.longitude,
    altitude: overrides.altitude,
    width: overrides.width || 6720,
    height: overrides.height || 4480,
    thumbnailSmall: overrides.thumbnailSmall,
    thumbnailMedium: overrides.thumbnailMedium,
    thumbnailLarge: overrides.thumbnailLarge,
    metadata: overrides.metadata,
    processedAt: overrides.processedAt,
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
    ...overrides,
  };
}

/**
 * Creates a video fixture
 */
export function createVideoFixture(overrides: Partial<MediaFixture> = {}): MediaFixture {
  const timestamp = Date.now();
  const key = overrides.key || `test-video-${timestamp}.mp4`;
  const now = new Date();

  return {
    key,
    filename: overrides.filename || 'test-wedding-video.mp4',
    type: 'video',
    size: overrides.size || 52428800, // 50MB
    uploadedAt: overrides.uploadedAt || now,
    dateTaken: overrides.dateTaken || baseDate,
    width: overrides.width || 1920,
    height: overrides.height || 1080,
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now,
    ...overrides,
  };
}

/**
 * Predefined fixture sets for common test scenarios
 */
export const fixtures = {
  /**
   * Wedding ceremony photos from multiple cameras
   */
  weddingCeremony: [
    createImageFixture({
      key: 'ceremony-001.jpg',
      filename: 'ceremony-first-kiss.jpg',
      dateTaken: new Date('2024-06-15T15:00:00Z'),
      ...sampleExifMetadata.Canon5D,
      ...sampleLocations.sanFrancisco,
      width: 6720,
      height: 4480,
    }),
    createImageFixture({
      key: 'ceremony-002.jpg',
      filename: 'ceremony-walking-down-aisle.jpg',
      dateTaken: new Date('2024-06-15T14:45:00Z'),
      ...sampleExifMetadata.Sony7,
      ...sampleLocations.sanFrancisco,
      width: 6000,
      height: 4000,
    }),
    createImageFixture({
      key: 'ceremony-003.jpg',
      filename: 'ceremony-rings.jpg',
      dateTaken: new Date('2024-06-15T14:50:00Z'),
      ...sampleExifMetadata.Canon5D,
      ...sampleLocations.sanFrancisco,
      focalLength: 100,
      aperture: 2.8,
      width: 6720,
      height: 4480,
    }),
  ],

  /**
   * Reception photos including guest photos from phones
   */
  reception: [
    createImageFixture({
      key: 'reception-001.jpg',
      filename: 'reception-first-dance.jpg',
      dateTaken: new Date('2024-06-15T18:00:00Z'),
      ...sampleExifMetadata.Canon5D,
      width: 6720,
      height: 4480,
    }),
    createImageFixture({
      key: 'reception-002.jpg',
      filename: 'guest-photo-table.jpg',
      dateTaken: new Date('2024-06-15T18:30:00Z'),
      ...sampleExifMetadata.iPhone,
      width: 4032,
      height: 3024,
    }),
  ],

  /**
   * Video clips
   */
  videos: [
    createVideoFixture({
      key: 'video-001.mp4',
      filename: 'ceremony-vows.mp4',
      dateTaken: new Date('2024-06-15T15:00:00Z'),
      width: 3840,
      height: 2160, // 4K
    }),
    createVideoFixture({
      key: 'video-002.mp4',
      filename: 'reception-toast.mp4',
      dateTaken: new Date('2024-06-15T18:15:00Z'),
      width: 1920,
      height: 1080, // Full HD
    }),
  ],

  /**
   * Media with processed thumbnails
   */
  processedMedia: [
    createImageFixture({
      key: 'processed-001.jpg',
      filename: 'processed-photo.jpg',
      dateTaken: new Date('2024-06-15T16:00:00Z'),
      thumbnailSmall: 'thumbnails/processed-001_small.jpg',
      thumbnailMedium: 'thumbnails/processed-001_medium.jpg',
      thumbnailLarge: 'thumbnails/processed-001_large.jpg',
      processedAt: new Date(),
      width: 6720,
      height: 4480,
    }),
  ],

  /**
   * Media with minimal metadata (e.g., older uploads)
   */
  minimalMetadata: [
    createImageFixture({
      key: 'minimal-001.jpg',
      filename: 'old-upload.jpg',
      cameraMake: undefined,
      cameraModel: undefined,
      lens: undefined,
      focalLength: undefined,
      aperture: undefined,
      shutterSpeed: undefined,
      iso: undefined,
      width: undefined,
      height: undefined,
      dateTaken: undefined,
    }),
  ],
};

/**
 * Creates Prisma-compatible data for seeding
 */
export function toPrismaCreate(fixture: MediaFixture): Prisma.MediaCreateInput {
  return {
    key: fixture.key,
    filename: fixture.filename,
    type: fixture.type,
    size: fixture.size,
    uploadedAt: fixture.uploadedAt,
    dateTaken: fixture.dateTaken,
    cameraMake: fixture.cameraMake,
    cameraModel: fixture.cameraModel,
    lens: fixture.lens,
    focalLength: fixture.focalLength,
    aperture: fixture.aperture,
    shutterSpeed: fixture.shutterSpeed,
    iso: fixture.iso,
    latitude: fixture.latitude,
    longitude: fixture.longitude,
    altitude: fixture.altitude,
    width: fixture.width,
    height: fixture.height,
    thumbnailSmall: fixture.thumbnailSmall,
    thumbnailMedium: fixture.thumbnailMedium,
    thumbnailLarge: fixture.thumbnailLarge,
    metadata: fixture.metadata,
    processedAt: fixture.processedAt,
    createdAt: fixture.createdAt,
    updatedAt: fixture.updatedAt,
  };
}

/**
 * Helper to create mock binary data for images
 */
export function createMockImageData(format: 'jpeg' | 'png' = 'jpeg'): Uint8Array {
  if (format === 'jpeg') {
    // Minimal valid JPEG header
    return new Uint8Array([
      0xFF, 0xD8, 0xFF, 0xE0, // JPEG SOI + APP0
      0x00, 0x10, // APP0 length
      0x4A, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
      0x01, 0x01, // Version 1.1
      0x00, // Density units (none)
      0x00, 0x01, 0x00, 0x01, // X/Y density
      0x00, 0x00, // Thumbnail dimensions (none)
      0xFF, 0xD9, // EOI
    ]);
  } else {
    // Minimal valid PNG header
    return new Uint8Array([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, // IHDR length
      0x49, 0x48, 0x44, 0x52, // "IHDR"
      0x00, 0x00, 0x00, 0x01, // Width: 1
      0x00, 0x00, 0x00, 0x01, // Height: 1
      0x08, 0x02, 0x00, 0x00, 0x00, // Bit depth, color type, etc.
    ]);
  }
}

/**
 * Helper to create mock video data
 */
export function createMockVideoData(): Uint8Array {
  // Minimal valid MP4 header (ftyp box)
  return new Uint8Array([
    0x00, 0x00, 0x00, 0x20, // Box size
    0x66, 0x74, 0x79, 0x70, // "ftyp"
    0x69, 0x73, 0x6F, 0x6D, // "isom" - major brand
    0x00, 0x00, 0x02, 0x00, // Minor version
    0x69, 0x73, 0x6F, 0x6D, // Compatible brand 1
    0x69, 0x73, 0x6F, 0x32, // Compatible brand 2
    0x61, 0x76, 0x63, 0x31, // Compatible brand 3
    0x6D, 0x70, 0x34, 0x31, // Compatible brand 4
  ]);
}
