/**
 * Custom error classes for SnapDBJS
 */

export class SnapDBError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'SnapDBError';
    Object.setPrototypeOf(this, SnapDBError.prototype);
  }
}

export class ValidationError extends SnapDBError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class WorkerError extends SnapDBError {
  constructor(message: string, details?: any) {
    super(message, 'WORKER_ERROR', details);
    this.name = 'WorkerError';
  }
}

export class StorageError extends SnapDBError {
  constructor(message: string, details?: any) {
    super(message, 'STORAGE_ERROR', details);
    this.name = 'StorageError';
  }
}

export class CompactionError extends SnapDBError {
  constructor(message: string, details?: any) {
    super(message, 'COMPACTION_ERROR', details);
    this.name = 'CompactionError';
  }
}

export class PluginError extends SnapDBError {
  constructor(message: string, pluginName: string, details?: any) {
    super(message, 'PLUGIN_ERROR', { plugin: pluginName, ...details });
    this.name = 'PluginError';
  }
}

export class KeyNotFoundError extends SnapDBError {
  constructor(key: any) {
    super(`Key not found: ${String(key)}`, 'KEY_NOT_FOUND', { key });
    this.name = 'KeyNotFoundError';
  }
}

export class MemoryLimitError extends SnapDBError {
  constructor(currentSize: number, maxSize: number) {
    super(
      `Memory limit exceeded. Current: ${currentSize}, Max: ${maxSize}`,
      'MEMORY_LIMIT_EXCEEDED',
      { currentSize, maxSize }
    );
    this.name = 'MemoryLimitError';
  }
}

export class TimeoutError extends SnapDBError {
  constructor(operation: string, timeout: number) {
    super(
      `Operation '${operation}' timed out after ${timeout}ms`,
      'TIMEOUT',
      { operation, timeout }
    );
    this.name = 'TimeoutError';
  }
}

export class SerializationError extends SnapDBError {
  constructor(message: string, value?: any) {
    super(message, 'SERIALIZATION_ERROR', { value });
    this.name = 'SerializationError';
  }
}

export const ErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  WORKER_ERROR: 'WORKER_ERROR',
  STORAGE_ERROR: 'STORAGE_ERROR',
  COMPACTION_ERROR: 'COMPACTION_ERROR',
  PLUGIN_ERROR: 'PLUGIN_ERROR',
  KEY_NOT_FOUND: 'KEY_NOT_FOUND',
  MEMORY_LIMIT_EXCEEDED: 'MEMORY_LIMIT_EXCEEDED',
  TIMEOUT: 'TIMEOUT',
  SERIALIZATION_ERROR: 'SERIALIZATION_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR'
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

export function isSnapDBError(error: any): error is SnapDBError {
  return error instanceof SnapDBError;
}

export function serializeError(error: Error): {
  code: string;
  message: string;
  stack?: string;
  details?: any;
} {
  if (isSnapDBError(error)) {
    return {
      code: error.code,
      message: error.message,
      stack: error.stack,
      details: error.details
    };
  }
  
  return {
    code: ErrorCodes.UNKNOWN_ERROR,
    message: error.message || 'Unknown error',
    stack: error.stack
  };
}

export function deserializeError(serialized: {
  code: string;
  message: string;
  stack?: string;
  details?: any;
}): SnapDBError {
  const error = new SnapDBError(serialized.message, serialized.code, serialized.details);
  if (serialized.stack) {
    error.stack = serialized.stack;
  }
  return error;
}