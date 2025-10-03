import { describe, it, expect, vi } from 'vitest';
// Use a manual mock for exifr.parse due to ESM limitations
const exifr = {
  parse: async () => ({})
};
// @ts-ignore: JS import
import { processImage } from '../src/lib/processor';

// Helper: create a mock R2 object with arrayBuffer()
function createMockR2Object(buffer: any) {
  return {
    arrayBuffer: async () => buffer,
  };
}

describe('processImage', () => {
  it('should extract EXIF data and populate metadata', async () => {
    // Mock EXIF data to be returned by exifr.parse
    const mockExif = {
      DateTimeOriginal: '2022-01-01T12:00:00',
      Make: 'Canon',
      Model: 'EOS 5D',
      LensModel: 'EF 24-70mm',
      FocalLength: 24,
      FNumber: 2.8,
      ExposureTime: 0.01,
      ISO: 100,
      GPSLatitude: 37.7749,
      GPSLongitude: -122.4194,
      GPSAltitude: 10
    };
  // Manually mock exifr.parse
  exifr.parse = async () => mockExif;

  const buffer: any = new ArrayBuffer(8); // Dummy buffer
  const object = createMockR2Object(buffer);
  const metadata: any = {};

  await processImage({}, object, metadata, async () => mockExif);

  expect(metadata.date_taken).toBe(mockExif.DateTimeOriginal);
  expect(metadata.camera_make).toBe(mockExif.Make);
  expect(metadata.camera_model).toBe(mockExif.Model);
  expect(metadata.lens).toBe(mockExif.LensModel);
  expect(metadata.focal_length).toBe(mockExif.FocalLength);
  expect(metadata.aperture).toBe(mockExif.FNumber);
  expect(metadata.shutter_speed).toBe(mockExif.ExposureTime);
  expect(metadata.iso).toBe(mockExif.ISO);
  expect(metadata.latitude).toBe(mockExif.GPSLatitude);
  expect(metadata.longitude).toBe(mockExif.GPSLongitude);
  expect(metadata.altitude).toBe(mockExif.GPSAltitude);
  expect(metadata.metadata).toEqual(mockExif);
  });
});
