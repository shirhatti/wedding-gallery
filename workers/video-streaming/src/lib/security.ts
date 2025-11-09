/**
 * Security utilities for validating user inputs
 */

/**
 * Sanitize and validate video key to prevent path traversal attacks
 *
 * @param key - The video key from user input
 * @returns Sanitized key
 * @throws Error if key contains suspicious patterns
 */
export function sanitizeVideoKey(key: string): string {
  if (!key || key.trim() === "") {
    throw new Error("Video key cannot be empty");
  }

  // Prevent path traversal attacks
  if (key.includes("..")) {
    throw new Error("Invalid video key: path traversal detected");
  }

  // Prevent absolute paths
  if (key.startsWith("/")) {
    throw new Error("Invalid video key: absolute paths not allowed");
  }

  // Prevent null bytes
  if (key.includes("\0")) {
    throw new Error("Invalid video key: null bytes not allowed");
  }

  // Allow alphanumeric, dash, underscore, dot, forward slash, space, and plus
  // Note: This accepts characters commonly found in uploaded filenames
  // Path traversal is prevented by the checks above
  const safePattern = /^[a-zA-Z0-9._\-\/ +]+$/;
  if (!safePattern.test(key)) {
    throw new Error("Invalid video key: contains unsafe characters");
  }

  return key;
}

/**
 * Sanitize filename to prevent directory traversal
 *
 * @param filename - The filename from user input
 * @returns Sanitized filename
 * @throws Error if filename contains suspicious patterns
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || filename.trim() === "") {
    throw new Error("Filename cannot be empty");
  }

  // Prevent path traversal
  if (filename.includes("..") || filename.includes("/")) {
    throw new Error("Invalid filename: path components not allowed");
  }

  // Prevent null bytes
  if (filename.includes("\0")) {
    throw new Error("Invalid filename: null bytes not allowed");
  }

  // Only allow safe characters: alphanumeric, dash, underscore, dot
  const safePattern = /^[a-zA-Z0-9._\-]+$/;
  if (!safePattern.test(filename)) {
    throw new Error("Invalid filename: contains unsafe characters");
  }

  return filename;
}
