/**
 * Base middleware class for SnapDBJS
 */

import { CommandContext, MiddlewareFn, NextFunction } from '../types';

export abstract class Middleware<K = string, V = any> {
  abstract execute(context: CommandContext<K, V>, next: NextFunction): Promise<any>;

  toFunction(): MiddlewareFn<K, V> {
    return (context, next) => this.execute(context, next);
  }
}