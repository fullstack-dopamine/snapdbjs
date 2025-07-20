/**
 * Base command interface for SnapDBJS
 */

import { CommandType, WorkerRequest } from '../../types';

export interface Command<K = string, V = any, R = any> {
  readonly type: CommandType;
  
  createRequest(args: any): WorkerRequest<K, V>;
  
  validateArgs(args: any): void;
  
  processResponse(response: any): R;
}