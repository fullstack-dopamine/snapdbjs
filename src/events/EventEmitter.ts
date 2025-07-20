/**
 * Custom event emitter for SnapDB
 */

import { EventEmitter as NodeEventEmitter } from 'events';
import { SnapDBEvent, EventPayload } from '../types';
import { logger } from '../utils/logger';

export class SnapDBEventEmitter extends NodeEventEmitter {
  override emit(event: SnapDBEvent, payload: unknown): boolean {
    const eventPayload: EventPayload = {
      event,
      timestamp: Date.now(),
      data: payload as EventPayload['data']
    };

    logger.debug('Event emitted', { event, payload });
    
    return super.emit(event, eventPayload);
  }

  override on(event: SnapDBEvent, listener: (payload: EventPayload) => void): this {
    return super.on(event, listener);
  }

  override off(event: SnapDBEvent, listener: (payload: EventPayload) => void): this {
    return super.off(event, listener);
  }

  override once(event: SnapDBEvent, listener: (payload: EventPayload) => void): this {
    return super.once(event, listener);
  }
}