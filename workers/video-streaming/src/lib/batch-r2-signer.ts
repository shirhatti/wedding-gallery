/**
 * Batch signing for R2 URLs with optimized crypto operations
 * Reuses signing key and timestamp across multiple URLs
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
 * Batch sign multiple R2 URLs efficiently
 * Key optimization: Derives signing key once and reuses for all URLs
 *
 * Performance: For N URLs
 * - Old approach: N × 6 HMAC operations = 6N operations
 * - Batch approach: 4 + N × 2 HMAC operations ≈ 2N operations (3x faster)
 *
 * Example for 600 segments:
 * - Old: 3,600 HMAC operations
 * - Batch: 1,204 HMAC operations (67% reduction)
 */
export async function batchSignR2Urls(
  config: SigningConfig,
  objectKeys: string[],
  expiresInSeconds: number = 14400 // 4 hours default
): Promise<string[]> {
  if (objectKeys.length === 0) {
    return [];
  }

  const endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
  const method = "GET";
  const service = "s3";
  const algorithm = "AWS4-HMAC-SHA256";
  const canonicalHeaders = `host:${config.accountId}.r2.cloudflarestorage.com\n`;
  const signedHeaders = "host";
  const payloadHash = "UNSIGNED-PAYLOAD";

  // Use same timestamp for entire batch
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.substring(0, 8);
  const credentialScope = `${dateStamp}/${config.region}/${service}/aws4_request`;
  const credential = `${config.accessKeyId}/${credentialScope}`;

  // Derive signing key once for the entire batch
  const signingKey = await getSignatureKey(
    config.secretAccessKey,
    dateStamp,
    config.region,
    service
  );

  // Sign each URL using the pre-derived signing key
  const signedUrls = await Promise.all(
    objectKeys.map(async (objectKey) => {
      const canonicalUri = `/${config.bucket}/${objectKey}`;

      // Query parameters
      const queryParams = new URLSearchParams({
        "X-Amz-Algorithm": algorithm,
        "X-Amz-Credential": credential,
        "X-Amz-Date": amzDate,
        "X-Amz-Expires": expiresInSeconds.toString(),
        "X-Amz-SignedHeaders": signedHeaders,
      });

      // Canonical request
      const canonicalQueryString = queryParams.toString();
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

      // Calculate signature using pre-derived key
      const signature = toHex(await hmacSha256(signingKey, stringToSign));

      // Build final URL
      queryParams.set("X-Amz-Signature", signature);
      return `${endpoint}${canonicalUri}?${queryParams.toString()}`;
    })
  );

  return signedUrls;
}

/**
 * Batch sign with KV caching
 * Checks cache first, only signs cache misses, then stores new signatures
 */
export async function batchSignWithCache(
  kv: KVNamespace,
  config: SigningConfig,
  objectKeys: string[],
  expiresInSeconds: number = 14400 // 4 hours
): Promise<string[]> {
  if (objectKeys.length === 0) {
    return [];
  }

  const timeWindow = Math.floor(Date.now() / 1000 / expiresInSeconds);
  const cacheTtl = Math.floor(expiresInSeconds * 0.9);

  // Check cache for all URLs
  const cacheKeys = objectKeys.map(key => `signed:${key}:${timeWindow}`);
  const cacheResults = await Promise.all(
    cacheKeys.map(cacheKey => kv.get(cacheKey))
  );

  // Identify cache misses
  const misses: { index: number; objectKey: string }[] = [];
  const results: string[] = new Array(objectKeys.length);

  cacheResults.forEach((cached, i) => {
    if (cached) {
      results[i] = cached;
    } else {
      misses.push({ index: i, objectKey: objectKeys[i] });
    }
  });

  // Batch sign all cache misses
  if (misses.length > 0) {
    const missKeys = misses.map(m => m.objectKey);
    const signedUrls = await batchSignR2Urls(config, missKeys, expiresInSeconds);

    // Store in cache and update results
    await Promise.all(
      signedUrls.map((signedUrl, i) => {
        const miss = misses[i];
        results[miss.index] = signedUrl;
        return kv.put(cacheKeys[miss.index], signedUrl, { expirationTtl: cacheTtl });
      })
    );
  }

  return results;
}
