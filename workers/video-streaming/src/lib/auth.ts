/**
 * Authentication helpers for video streaming worker
 * Validates auth tokens created by the viewer worker
 */

import type { VideoStreamingEnv } from "../types";

/**
 * Validate authentication token from cookie
 * Tokens are created by the viewer worker and validated here
 */
export async function validateAuthToken(
  env: VideoStreamingEnv,
  audience: string,
  token: string
): Promise<boolean> {
  const secret = env.AUTH_SECRET;
  if (!secret) {
    return false;
  }

  try {
    // Token format: {payload}.{signature}
    const parts = token.split(".");
    if (parts.length !== 2) {
      return false;
    }

    const [payload, providedSig] = parts;

    // Verify signature
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const expectedSigBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(payload)
    );

    const expectedSig = btoa(String.fromCharCode(...new Uint8Array(expectedSigBuffer)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    if (expectedSig !== providedSig) {
      return false;
    }

    // Parse payload: {audience}|{version}|{issuedAt}
    const payloadParts = payload.split("|");
    if (payloadParts.length !== 3) {
      return false;
    }

    const [tokenAudience, version, issuedAtStr] = payloadParts;

    // Verify audience matches
    if (tokenAudience !== audience) {
      return false;
    }

    // Check if token version is still valid
    const currentVersion = (await env.VIDEO_CACHE.get("auth_version")) || "1";
    if (version !== currentVersion) {
      return false;
    }

    // Check expiration (30 days)
    const issuedAt = parseInt(issuedAtStr, 10);
    const now = Math.floor(Date.now() / 1000);
    const maxAge = 30 * 24 * 60 * 60; // 30 days in seconds

    if (now - issuedAt > maxAge) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
