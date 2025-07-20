/**
 * TTL cleanup middleware for SnapDBJS
 */

import { MiddlewareFn, CommandContext } from '../types';

export interface TTLMiddlewareOptions {
  cleanupProbability?: number; // Probability of running cleanup (0-1)
  maxCleanupKeys?: number; // Max keys to check per cleanup
}

export function TTLMiddleware<K = string, V = any>(
  options: TTLMiddlewareOptions = {}
): MiddlewareFn<K, V> {
  const {
    cleanupProbability = 0.1 // 10% chance
  } = options;

  let lastCleanup = Date.now();
  const minCleanupInterval = 1000; // 1 second

  return async (ctx: CommandContext<K, V>, next) => {
    // Run cleanup based on probability and minimum interval
    const shouldCleanup = 
      Math.random() < cleanupProbability &&
      Date.now() - lastCleanup > minCleanupInterval;

    if (shouldCleanup && ctx.command === 'GET') {
      lastCleanup = Date.now();
      
      // In a real implementation, this would:
      // 1. Get a random sample of keys
      // 2. Check their TTL
      // 3. Delete expired ones
      // This is just a placeholder for the concept
    }

    const result = await next();

    // For GET commands, check if the key is expired
    if (ctx.command === 'GET' && result === null && ctx.key) {
      // Key might have been expired, emit event
      // This would be handled by the storage engine
    }

    return result;
  };
}