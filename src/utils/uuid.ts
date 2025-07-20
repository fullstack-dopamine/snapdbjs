/**
 * UUID utility using Node.js built-in crypto.randomUUID()
 */

import { randomUUID } from 'crypto';

/**
 * Generate a random UUID v4
 * @returns A random UUID string
 */
export function generateUUID(): string {
  return randomUUID();
}

/**
 * Alias for generateUUID for compatibility
 */
export const v4 = generateUUID;

/**
 * Default export for backward compatibility
 */
export default {
  v4: generateUUID
};