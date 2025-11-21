/**
 * Count-Min Sketch Implementation
 * Probabilistic data structure for approximate frequency counting
 * - Provides approximate counts with bounded error
 * - Never undercounts (only overcounts)
 */

import type { CountMinSketchMetadata } from './types/manifests';

const MAGIC_NUMBER = 0x434D5348; // "CMSH" in ASCII

/**
 * Simple hash function for strings
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

export class CountMinSketch {
  private table: Uint32Array;
  private width: number;
  private depth: number;
  private totalCount: number;

  /**
   * Create a new Count-Min Sketch
   * @param width - Width of the table (affects accuracy)
   * @param depth - Depth of the table (affects confidence)
   */
  constructor(width: number = 10000, depth: number = 5) {
    this.width = width;
    this.depth = depth;
    this.table = new Uint32Array(width * depth);
    this.totalCount = 0;
  }

  /**
   * Get index in the flat array
   */
  private getIndex(row: number, col: number): number {
    return row * this.width + col;
  }

  /**
   * Add an item to the sketch
   * @param item - Item to add
   * @param count - Count to add (default 1)
   */
  add(item: string, count: number = 1): void {
    for (let i = 0; i < this.depth; i++) {
      const hash = simpleHash(item, i);
      const col = hash % this.width;
      const index = this.getIndex(i, col);

      // Check for overflow (uint32 max is 4,294,967,295)
      const newValue = this.table[index] + count;
      if (newValue > 0xFFFFFFFF) {
        this.table[index] = 0xFFFFFFFF; // Cap at max
      } else {
        this.table[index] = newValue;
      }
    }
    this.totalCount += count;
  }

  /**
   * Estimate the count for an item
   * Returns the minimum count across all hash functions (conservative estimate)
   */
  estimate(item: string): number {
    let minCount = Infinity;

    for (let i = 0; i < this.depth; i++) {
      const hash = simpleHash(item, i);
      const col = hash % this.width;
      const index = this.getIndex(i, col);
      const count = this.table[index];

      if (count < minCount) {
        minCount = count;
      }
    }

    return minCount === Infinity ? 0 : minCount;
  }

  /**
   * Get all counts for an item across all hash functions
   * Useful for debugging
   */
  getAllEstimates(item: string): number[] {
    const estimates: number[] = [];

    for (let i = 0; i < this.depth; i++) {
      const hash = simpleHash(item, i);
      const col = hash % this.width;
      const index = this.getIndex(i, col);
      estimates.push(this.table[index]);
    }

    return estimates;
  }

  /**
   * Merge another Count-Min Sketch into this one
   * Both sketches must have the same dimensions
   */
  merge(other: CountMinSketch): CountMinSketch {
    if (this.width !== other.width || this.depth !== other.depth) {
      throw new Error('Cannot merge Count-Min Sketches with different dimensions');
    }

    const merged = new CountMinSketch(this.width, this.depth);

    for (let i = 0; i < this.table.length; i++) {
      const sum = this.table[i] + other.table[i];
      merged.table[i] = Math.min(sum, 0xFFFFFFFF); // Cap at uint32 max
    }

    merged.totalCount = this.totalCount + other.totalCount;

    return merged;
  }

  /**
   * Serialize to binary format
   * Format:
   * - 4 bytes: Magic number (0x434D5348)
   * - 4 bytes: Version (1)
   * - 4 bytes: Width
   * - 4 bytes: Depth
   * - 4 bytes: Total count
   * - 4 bytes: Reserved
   * - N bytes: Table data (width * depth * 4 bytes)
   */
  toBytes(): Uint8Array {
    const headerSize = 24;
    const tableSize = this.table.length * 4;
    const buffer = new Uint8Array(headerSize + tableSize);
    const view = new DataView(buffer.buffer);

    // Write header
    view.setUint32(0, MAGIC_NUMBER, true);
    view.setUint32(4, 1, true); // Version
    view.setUint32(8, this.width, true);
    view.setUint32(12, this.depth, true);
    view.setUint32(16, this.totalCount, true);
    view.setUint32(20, 0, true); // Reserved

    // Write table data
    for (let i = 0; i < this.table.length; i++) {
      view.setUint32(headerSize + i * 4, this.table[i], true);
    }

    return buffer;
  }

  /**
   * Deserialize from binary format
   */
  static fromBytes(data: Uint8Array): CountMinSketch {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    // Read and validate header
    const magic = view.getUint32(0, true);
    if (magic !== MAGIC_NUMBER) {
      throw new Error(`Invalid Count-Min Sketch magic number: 0x${magic.toString(16)}`);
    }

    const version = view.getUint32(4, true);
    if (version !== 1) {
      throw new Error(`Unsupported Count-Min Sketch version: ${version}`);
    }

    const width = view.getUint32(8, true);
    const depth = view.getUint32(12, true);
    const totalCount = view.getUint32(16, true);

    // Create sketch instance
    const sketch = new CountMinSketch(width, depth);
    sketch.totalCount = totalCount;

    // Read table data
    const headerSize = 24;
    for (let i = 0; i < sketch.table.length; i++) {
      sketch.table[i] = view.getUint32(headerSize + i * 4, true);
    }

    return sketch;
  }

  /**
   * Get metadata about the sketch
   */
  getMetadata(): CountMinSketchMetadata {
    return {
      magic: MAGIC_NUMBER,
      version: 1,
      width: this.width,
      depth: this.depth,
      total_count: this.totalCount
    };
  }

  /**
   * Get the size in bytes
   */
  getSizeBytes(): number {
    return 24 + (this.table.length * 4);
  }

  /**
   * Get the total count of all items
   */
  getTotalCount(): number {
    return this.totalCount;
  }

  /**
   * Clear all counts
   */
  clear(): void {
    this.table.fill(0);
    this.totalCount = 0;
  }

  /**
   * Get the theoretical error bound
   * Returns the maximum overestimation error with probability (1 - 1/depth)
   */
  getErrorBound(): number {
    return this.totalCount / this.width;
  }

  /**
   * Get heavy hitters (items that appear frequently)
   * This is a naive implementation - for production, use a more sophisticated approach
   */
  getTopItems(items: string[], k: number): Array<{ item: string; count: number }> {
    const itemCounts = items.map(item => ({
      item,
      count: this.estimate(item)
    }));

    return itemCounts
      .sort((a, b) => b.count - a.count)
      .slice(0, k);
  }
}

/**
 * Helper function to create a Count-Min Sketch from a list of items
 */
export function createCountMinSketch(
  items: string[],
  width: number = 10000,
  depth: number = 5
): CountMinSketch {
  const sketch = new CountMinSketch(width, depth);

  for (const item of items) {
    sketch.add(item);
  }

  return sketch;
}

/**
 * Helper function to estimate item frequency from a Count-Min Sketch stored in R2
 */
export async function estimateFromSketch(
  data: ArrayBuffer,
  item: string
): Promise<number> {
  const sketch = CountMinSketch.fromBytes(new Uint8Array(data));
  return sketch.estimate(item);
}

/**
 * Calculate optimal dimensions for a Count-Min Sketch
 * @param epsilon - Error bound (e.g., 0.001 for 0.1% error)
 * @param delta - Failure probability (e.g., 0.01 for 99% confidence)
 */
export function calculateOptimalDimensions(
  epsilon: number,
  delta: number
): { width: number; depth: number } {
  const width = Math.ceil(Math.E / epsilon);
  const depth = Math.ceil(Math.log(1 / delta));

  return { width, depth };
}
