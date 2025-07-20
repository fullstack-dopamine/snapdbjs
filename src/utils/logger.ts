/**
 * Logger utility for SnapDBJS
 */

import { LogEntry } from '../types';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  level: LogLevel;
  prefix?: string;
  enabled?: boolean;
}

export class Logger {
  private static instance: Logger;
  private level: LogLevel;
  private prefix: string;
  private enabled: boolean;
  
  private readonly levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
  };

  constructor(options: LoggerOptions) {
    this.level = options.level;
    this.prefix = options.prefix || '[SnapDB]';
    this.enabled = options.enabled ?? true;
  }

  static getInstance(options?: LoggerOptions): Logger {
    if (!Logger.instance && options) {
      Logger.instance = new Logger(options);
    }
    return Logger.instance;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  private shouldLog(level: LogLevel): boolean {
    return this.enabled && this.levels[level] >= this.levels[this.level];
  }

  private formatMessage(level: LogLevel, message: string, data?: any): string {
    const timestamp = new Date().toISOString();
    const baseMessage = `${timestamp} ${this.prefix} [${level.toUpperCase()}] ${message}`;
    
    if (data) {
      return `${baseMessage} ${JSON.stringify(data)}`;
    }
    
    return baseMessage;
  }

  private log(level: LogLevel, message: string, data?: any): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, data);

    switch (level) {
      case 'debug':
        console.debug(formattedMessage);
        break;
      case 'info':
        console.info(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      case 'error':
        console.error(formattedMessage);
        break;
    }
  }

  debug(message: string, data?: any): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: any): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: any): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: any): void {
    this.log('error', message, data);
  }

  createEntry(level: LogLevel, message: string, data?: any): LogEntry {
    return {
      timestamp: Date.now(),
      level,
      message,
      data
    };
  }
}

export const createLogger = (options: LoggerOptions): Logger => {
  return new Logger(options);
};

export const logger = Logger.getInstance({
  level: 'info',
  enabled: process.env.NODE_ENV !== 'test'
});

export function getLogger(): Logger {
  return logger;
}