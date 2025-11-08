import type { VideoStreamingEnv } from "./types";
/**
 * AWS Signature Version 4 signing for R2 pre-signed URLs
 * Lightweight implementation without full AWS SDK
 */

interface SigningConfig {
  accessKeyId: string
  secretAccessKey: string
  region: string
  bucket: string
  accountId: string
}

async function sha256(message: string): Promise<ArrayBuffer> {
  const msgBuffer = new TextEncoder().encode(message);
  return await crypto.subtle.digest("SHA-256", msgBuffer);
}

async function hmacSha256(key: ArrayBuffer | string, message: string): Promise<ArrayBuffer> {
  const keyData = typeof key === "string" ? new TextEncoder().encode(key) : key;
  const msgBuffer = new TextEncoder().encode(message);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return await crypto.subtle.sign("HMAC", cryptoKey, msgBuffer);
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getSignatureKey(
  key: string,
  dateStamp: string,
  regionName: string,
  serviceName: string
): Promise<ArrayBuffer> {
  const kDate = await hmacSha256("AWS4" + key, dateStamp);
  const kRegion = await hmacSha256(kDate, regionName);
  const kService = await hmacSha256(kRegion, serviceName);
  const kSigning = await hmacSha256(kService, "aws4_request");
  return kSigning;
}

/**
 * Generate a pre-signed URL for R2 object access
 */
export async function signR2Url(
  config: SigningConfig,
  objectKey: string,
  expiresInSeconds: number = 1800 // 30 minutes default
): Promise<string> {
  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
  const method = "GET";
  const service = "s3";

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.substring(0, 8);

  // Canonical request elements
  const canonicalUri = `/${config.bucket}/${objectKey}`;
  const algorithm = "AWS4-HMAC-SHA256";
  const credentialScope = `${dateStamp}/${config.region}/${service}/aws4_request`;
  const credential = `${config.accessKeyId}/${credentialScope}`;

  // Query parameters
  const queryParams = new URLSearchParams({
    "X-Amz-Algorithm": algorithm,
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": expiresInSeconds.toString(),
    "X-Amz-SignedHeaders": "host",
  });

  // Canonical request
  const canonicalQueryString = queryParams.toString();
  const canonicalHeaders = `host:${config.accountId}.r2.cloudflarestorage.com\n`;
  const signedHeaders = "host";
  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  // String to sign
  const canonicalRequestHash = toHex(await sha256(canonicalRequest));
  const stringToSign = [
    algorithm,
    amzDate,
    credentialScope,
    canonicalRequestHash,
  ].join("\n");

  // Calculate signature
  const signingKey = await getSignatureKey(
    config.secretAccessKey,
    dateStamp,
    config.region,
    service
  );
  const signature = toHex(await hmacSha256(signingKey, stringToSign));

  // Build final URL
  queryParams.set("X-Amz-Signature", signature);
  return `${endpoint}${canonicalUri}?${queryParams.toString()}`;
}

/**
 * Helper to get signing config from environment
 */
export function getSigningConfig(env: VideoStreamingEnv): SigningConfig {
  return {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    region: env.R2_REGION || "auto",
    bucket: env.R2_BUCKET_NAME,
    accountId: env.R2_ACCOUNT_ID,
  };
}
