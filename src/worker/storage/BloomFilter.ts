/**
 * Bloom Filter implementation for probabilistic key existence checking
 */

export class BloomFilter {
  private bits: Uint8Array;
  private size: number;
  private numHashes: number;

  constructor(size: number, numHashes: number = 3) {
    this.size = size;
    this.numHashes = numHashes;
    this.bits = new Uint8Array(Math.ceil(size / 8));
  }

  add(key: string): void {
    const hashes = this.getHashes(key);
    for (const hash of hashes) {
      const index = hash % this.size;
      const byteIndex = Math.floor(index / 8);
      const bitIndex = index % 8;
      this.bits[byteIndex] |= (1 << bitIndex);
    }
  }

  contains(key: string): boolean {
    const hashes = this.getHashes(key);
    for (const hash of hashes) {
      const index = hash % this.size;
      const byteIndex = Math.floor(index / 8);
      const bitIndex = index % 8;
      if ((this.bits[byteIndex] & (1 << bitIndex)) === 0) {
        return false;
      }
    }
    return true;
  }

  getBits(): Uint8Array {
    return new Uint8Array(this.bits);
  }

  getSize(): number {
    return this.size;
  }

  getNumHashes(): number {
    return this.numHashes;
  }

  getFalsePositiveRate(): number {
    const setBits = this.countSetBits();
    const n = setBits; // Approximate number of items
    const m = this.size;
    const k = this.numHashes;
    
    // Formula: (1 - e^(-k*n/m))^k
    return Math.pow(1 - Math.exp(-k * n / m), k);
  }

  private getHashes(key: string): number[] {
    const hashes: number[] = [];
    let hash1 = this.hash(key);
    let hash2 = this.hash(key + 'salt');

    for (let i = 0; i < this.numHashes; i++) {
      hashes.push(Math.abs(hash1 + i * hash2));
    }

    return hashes;
  }

  private hash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private countSetBits(): number {
    let count = 0;
    for (const byte of this.bits) {
      let b = byte;
      while (b) {
        count += b & 1;
        b >>= 1;
      }
    }
    return count;
  }

  static fromData(data: { bits: Uint8Array; numHashes: number; size: number }): BloomFilter {
    const filter = new BloomFilter(data.size, data.numHashes);
    filter.bits = new Uint8Array(data.bits);
    return filter;
  }
}