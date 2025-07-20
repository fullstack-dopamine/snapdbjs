/**
 * ID generation utilities for SnapDBJS
 */

let counter = 0;

export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 9);
  const count = (counter++).toString(36);
  return `${timestamp}-${random}-${count}`;
}

export function generateSSTableId(level: number): string {
  return `sstable-L${level}-${generateId()}`;
}