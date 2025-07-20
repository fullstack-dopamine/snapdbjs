/**
 * Logging middleware for SnapDBJS
 */

import { MiddlewareFn, CommandContext } from '../types';
import { logger } from '../utils/logger';

export interface LoggingMiddlewareOptions {
  logLevel?: 'debug' | 'info';
  includeValues?: boolean;
  includeTimings?: boolean;
}

export function LoggingMiddleware<K = string, V = any>(
  options: LoggingMiddlewareOptions = {}
): MiddlewareFn<K, V> {
  const {
    logLevel = 'debug',
    includeValues = false,
    includeTimings = true
  } = options;

  return async (ctx: CommandContext<K, V>, next) => {
    const startTime = includeTimings ? Date.now() : 0;
    
    const logData: any = {
      command: ctx.command,
      key: ctx.key,
      keys: ctx.keys,
      pattern: ctx.pattern
    };

    if (includeValues) {
      logData.value = ctx.value;
      logData.values = ctx.values;
    }

    logger[logLevel](`Command started: ${ctx.command}`, logData);

    try {
      const result = await next();
      
      if (includeTimings) {
        const duration = Date.now() - startTime;
        logger[logLevel](`Command completed: ${ctx.command}`, { 
          ...logData, 
          duration,
          success: true 
        });
      }
      
      return result;
    } catch (error) {
      if (includeTimings) {
        const duration = Date.now() - startTime;
        logger.error(`Command failed: ${ctx.command}`, { 
          ...logData, 
          duration,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
      throw error;
    }
  };
}