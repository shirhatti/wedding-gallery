// Main processor logic for EXIF extraction
import * as exifr from "exifr";

export async function processImage(env, object, metadata, exifParser) {
  try {
    // Get image data
    const arrayBuffer = await object.arrayBuffer();

    // Extract EXIF data
  const exif = await (exifParser || exifr.parse)(arrayBuffer, {
      // Specify which tags we want
      pick: ["DateTimeOriginal", "Make", "Model", "LensModel",
             "FocalLength", "FNumber", "ExposureTime", "ISO",
             "GPSLatitude", "GPSLongitude", "GPSAltitude"]
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
    console.error("EXIF extraction failed:", error);
    // Continue even if EXIF fails
  }
}

