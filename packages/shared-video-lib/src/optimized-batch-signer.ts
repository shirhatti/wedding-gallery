/**
 * Ultra-optimized batch signing with cached signing key
 * Caches the AWS Signature V4 signing key for 24 hours
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

function toBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function fromBase64(str: string): ArrayBuffer {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function deriveSigningKey(
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
 * Get or derive the signing key, with 24-hour KV caching
 * This eliminates 4 HMAC operations per request
 */
async function getCachedSigningKey(
  kv: KVNamespace,
  config: SigningConfig,
  dateStamp: string
): Promise<ArrayBuffer> {
  const cacheKey = `signing-key:${dateStamp}:${config.region}`;

  // Try cache first
  const cached = await kv.get(cacheKey);
  if (cached) {
    return fromBase64(cached);
  }

  // Derive signing key (4 HMAC operations)
  const signingKey = await deriveSigningKey(
    config.secretAccessKey,
    dateStamp,
    config.region,
    "s3"
  );

  // Cache for 24 hours (key is date-based)
  const ttl = 86400; // 24 hours
  await kv.put(cacheKey, toBase64(signingKey), { expirationTtl: ttl });

  return signingKey;
}

/**
 * Ultra-optimized batch signing with cached signing key
 *
 * Performance for 600 URLs:
 * - Without key caching: 4 + 1200 = 1,204 ops (~150-300ms)
 * - With key caching: 0 + 1200 = 1,200 ops (~145-290ms)
 *
 * More importantly, eliminates the serialized 4-HMAC bottleneck,
 * allowing pure parallelization of the 2N operations.
 */
export async function batchSignWithCachedKey(
  kv: KVNamespace,
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

  // Get cached signing key (eliminates 4 HMAC operations)
  const signingKey = await getCachedSigningKey(kv, config, dateStamp);

  // Sign each URL using the cached signing key
  const signedUrls = await Promise.all(
    objectKeys.map(async (objectKey) => {
      const canonicalUri = `/${config.bucket}/${objectKey}`;

      const queryParams = new URLSearchParams({
        "X-Amz-Algorithm": algorithm,
        "X-Amz-Credential": credential,
        "X-Amz-Date": amzDate,
        "X-Amz-Expires": expiresInSeconds.toString(),
        "X-Amz-SignedHeaders": signedHeaders,
      });

      const canonicalQueryString = queryParams.toString();
      const canonicalRequest = [
        method,
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        payloadHash,
      ].join("\n");

      const canonicalRequestHash = toHex(await sha256(canonicalRequest));
      const stringToSign = [
        algorithm,
        amzDate,
        credentialScope,
        canonicalRequestHash,
      ].join("\n");

      const signature = toHex(await hmacSha256(signingKey, stringToSign));

      queryParams.set("X-Amz-Signature", signature);
      return `${endpoint}${canonicalUri}?${queryParams.toString()}`;
    })
  );

  return signedUrls;
}

/**
 * Batch sign with both signing key cache AND URL cache
 * Triple-layer optimization:
 * 1. Check URL cache (fastest - single KV read)
 * 2. Use cached signing key (fast - skips 4 HMAC ops)
 * 3. Batch sign misses in parallel
 */
export async function ultraOptimizedBatchSign(
  kv: KVNamespace,
  config: SigningConfig,
  objectKeys: string[],
  expiresInSeconds: number = 14400
): Promise<string[]> {
  if (objectKeys.length === 0) {
    return [];
  }

  const timeWindow = Math.floor(Date.now() / 1000 / expiresInSeconds);
  const cacheTtl = Math.floor(expiresInSeconds * 0.9);

  // Check URL cache for all URLs
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

  // Batch sign all cache misses using cached signing key
  if (misses.length > 0) {
    const missKeys = misses.map(m => m.objectKey);
    const signedUrls = await batchSignWithCachedKey(kv, config, missKeys, expiresInSeconds);

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
