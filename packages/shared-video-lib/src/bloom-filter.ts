/**
 * Bloom Filter Implementation
 * Probabilistic data structure for fast existence checks
 * - Guarantees no false negatives
 * - Configurable false positive rate
 */

import type { BloomFilterMetadata } from './types/manifests';

const MAGIC_NUMBER = 0x424C4F4D; // "BLOM" in ASCII

/**
 * Simple hash function for strings
 * Uses a basic implementation that works in both Node and Cloudflare Workers
 */
function simpleHash(str: string, seed: number): number {
  let hash = seed;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

export class BloomFilter {
  private bits: Uint8Array;
  private size: number; // Size in bits
  private numHashes: number;
  private itemCount: number;

  constructor(expectedItems: number, fpRate: number = 0.01) {
    this.size = this.optimalSize(expectedItems, fpRate);
    this.numHashes = this.optimalHashes(this.size, expectedItems);
    this.bits = new Uint8Array(Math.ceil(this.size / 8));
    this.itemCount = 0;
  }

  /**
   * Calculate optimal bit array size for given parameters
   */
  private optimalSize(n: number, p: number): number {
    return Math.ceil(-n * Math.log(p) / (Math.log(2) ** 2));
  }

  /**
   * Calculate optimal number of hash functions
   */
  private optimalHashes(m: number, n: number): number {
    return Math.max(1, Math.ceil((m / n) * Math.log(2)));
  }

  /**
   * Get bit at position
   */
  private getBit(index: number): boolean {
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    return ((this.bits[byteIndex] >> bitIndex) & 1) === 1;
  }

  /**
   * Set bit at position
   */
  private setBit(index: number): void {
    const byteIndex = Math.floor(index / 8);
    const bitIndex = index % 8;
    this.bits[byteIndex] |= (1 << bitIndex);
  }

  /**
   * Add an item to the bloom filter
   */
  add(item: string): void {
    for (let i = 0; i < this.numHashes; i++) {
      const hash = simpleHash(item, i);
      const index = hash % this.size;
      this.setBit(index);
    }
    this.itemCount++;
  }

  /**
   * Check if an item might be in the set
   * Returns true if item might be present (with false positive rate)
   * Returns false if item is definitely not present (no false negatives)
   */
  mightContain(item: string): boolean {
    for (let i = 0; i < this.numHashes; i++) {
      const hash = simpleHash(item, i);
      const index = hash % this.size;
      if (!this.getBit(index)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get the current false positive rate
   */
  estimatedFalsePositiveRate(): number {
    const k = this.numHashes;
    const m = this.size;
    const n = this.itemCount;
    return Math.pow(1 - Math.exp(-k * n / m), k);
  }

  /**
   * Serialize bloom filter to binary format
   * Format:
   * - 4 bytes: Magic number (0x424C4F4D)
   * - 4 bytes: Version (1)
   * - 4 bytes: Size in bits
   * - 4 bytes: Number of hash functions
   * - 4 bytes: Number of items added
   * - 4 bytes: Reserved
   * - N bytes: Bit array
   */
  toBytes(): Uint8Array {
    const headerSize = 24;
    const buffer = new Uint8Array(headerSize + this.bits.length);
    const view = new DataView(buffer.buffer);

    // Write header
    view.setUint32(0, MAGIC_NUMBER, true);
    view.setUint32(4, 1, true); // Version
    view.setUint32(8, this.size, true);
    view.setUint32(12, this.numHashes, true);
    view.setUint32(16, this.itemCount, true);
    view.setUint32(20, 0, true); // Reserved

    // Write bit array
    buffer.set(this.bits, headerSize);

    return buffer;
  }

  /**
   * Deserialize bloom filter from binary format
   */
  static fromBytes(data: Uint8Array): BloomFilter {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    // Read and validate header
    const magic = view.getUint32(0, true);
    if (magic !== MAGIC_NUMBER) {
      throw new Error(`Invalid bloom filter magic number: 0x${magic.toString(16)}`);
    }

    const version = view.getUint32(4, true);
    if (version !== 1) {
      throw new Error(`Unsupported bloom filter version: ${version}`);
    }

    const size = view.getUint32(8, true);
    const numHashes = view.getUint32(12, true);
    const itemCount = view.getUint32(16, true);

    // Create bloom filter instance
    const bf = new BloomFilter(1, 0.01); // Temporary values
    bf.size = size;
    bf.numHashes = numHashes;
    bf.itemCount = itemCount;
    bf.bits = new Uint8Array(data.buffer, data.byteOffset + 24, Math.ceil(size / 8));

    return bf;
  }

  /**
   * Get metadata about the bloom filter
   */
  getMetadata(): BloomFilterMetadata {
    return {
      magic: MAGIC_NUMBER,
      version: 1,
      size_bits: this.size,
      num_hashes: this.numHashes,
      num_items: this.itemCount
    };
  }

  /**
   * Get the size in bytes
   */
  getSizeBytes(): number {
    return 24 + this.bits.length;
  }

  /**
   * Get the number of items added
   */
  getItemCount(): number {
    return this.itemCount;
  }

  /**
   * Merge two bloom filters (union operation)
   * Both filters must have the same size and number of hash functions
   */
  merge(other: BloomFilter): BloomFilter {
    if (this.size !== other.size || this.numHashes !== other.numHashes) {
      throw new Error('Cannot merge bloom filters with different parameters');
    }

    const merged = new BloomFilter(1, 0.01); // Temporary values
    merged.size = this.size;
    merged.numHashes = this.numHashes;
    merged.bits = new Uint8Array(this.bits.length);
    merged.itemCount = this.itemCount + other.itemCount;

    // OR the bit arrays
    for (let i = 0; i < this.bits.length; i++) {
      merged.bits[i] = this.bits[i] | other.bits[i];
    }

    return merged;
  }

  /**
   * Clear all items from the filter
   */
  clear(): void {
    this.bits.fill(0);
    this.itemCount = 0;
  }
}

/**
 * Helper function to create a bloom filter from a list of items
 */
export function createBloomFilter(items: string[], fpRate: number = 0.01): BloomFilter {
  const filter = new BloomFilter(items.length, fpRate);
  for (const item of items) {
    filter.add(item);
  }
  return filter;
}

/**
 * Helper function to check if a bloom filter stored in R2 contains an item
 */
export async function checkBloomFilter(
  data: ArrayBuffer,
  item: string
): Promise<boolean> {
  const filter = BloomFilter.fromBytes(new Uint8Array(data));
  return filter.mightContain(item);
}
