/**
 * Pub/Sub plugin for SnapDBJS - provides publish/subscribe functionality
 */

import { Plugin, ISnapDB } from '../types';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface Subscription {
  id: string;
  pattern: string;
  callback: (channel: string, message: any) => void;
  isPattern: boolean;
}

export class PubSubPlugin<K = string, V = any> implements Plugin<K, V> {
  name = 'PubSubPlugin';
  version = '1.0.0';
  
  private channels: EventEmitter = new EventEmitter();
  private subscriptions: Map<string, Subscription> = new Map();
  private patternSubscriptions: Map<string, Subscription[]> = new Map();
  private subscriberCount: Map<string, number> = new Map();
  private nextId: number = 1;

  async init(store: ISnapDB<K, V>): Promise<void> {
    // Plugin initialized
    
    // Add pub/sub commands
    (store as any).publish = this.publish.bind(this);
    (store as any).subscribe = this.subscribe.bind(this);
    (store as any).unsubscribe = this.unsubscribe.bind(this);
    (store as any).psubscribe = this.psubscribe.bind(this);
    (store as any).punsubscribe = this.punsubscribe.bind(this);
    (store as any).pubsubChannels = this.pubsubChannels.bind(this);
    (store as any).pubsubNumsub = this.pubsubNumsub.bind(this);
    (store as any).pubsubNumpat = this.pubsubNumpat.bind(this);
    
    logger.info('PubSubPlugin initialized');
  }

  publish(channel: string, message: V): number {
    let receiverCount = 0;
    
    // Emit to exact channel subscribers
    const listeners = this.channels.listenerCount(channel);
    if (listeners > 0) {
      this.channels.emit(channel, channel, message);
      receiverCount += listeners;
    }
    
    // Check pattern subscriptions
    for (const [pattern, subs] of this.patternSubscriptions) {
      if (this.matchPattern(pattern, channel)) {
        for (const sub of subs) {
          sub.callback(channel, message);
          receiverCount++;
        }
      }
    }
    
    logger.debug('Message published', { channel, receivers: receiverCount });
    return receiverCount;
  }

  subscribe(channel: string, callback: (channel: string, message: V) => void): string {
    const id = `sub_${this.nextId++}`;
    const subscription: Subscription = {
      id,
      pattern: channel,
      callback: callback as any,
      isPattern: false
    };
    
    this.subscriptions.set(id, subscription);
    this.channels.on(channel, callback as any);
    
    // Update subscriber count
    const count = this.subscriberCount.get(channel) || 0;
    this.subscriberCount.set(channel, count + 1);
    
    logger.debug('Subscribed to channel', { channel, id });
    return id;
  }

  unsubscribe(id: string): boolean {
    const subscription = this.subscriptions.get(id);
    if (!subscription || subscription.isPattern) {
      return false;
    }
    
    this.channels.off(subscription.pattern, subscription.callback);
    this.subscriptions.delete(id);
    
    // Update subscriber count
    const count = this.subscriberCount.get(subscription.pattern) || 0;
    if (count > 1) {
      this.subscriberCount.set(subscription.pattern, count - 1);
    } else {
      this.subscriberCount.delete(subscription.pattern);
    }
    
    logger.debug('Unsubscribed from channel', { channel: subscription.pattern, id });
    return true;
  }

  psubscribe(pattern: string, callback: (channel: string, message: V) => void): string {
    const id = `psub_${this.nextId++}`;
    const subscription: Subscription = {
      id,
      pattern,
      callback: callback as any,
      isPattern: true
    };
    
    this.subscriptions.set(id, subscription);
    
    // Add to pattern subscriptions
    const patternSubs = this.patternSubscriptions.get(pattern) || [];
    patternSubs.push(subscription);
    this.patternSubscriptions.set(pattern, patternSubs);
    
    logger.debug('Subscribed to pattern', { pattern, id });
    return id;
  }

  punsubscribe(id: string): boolean {
    const subscription = this.subscriptions.get(id);
    if (!subscription || !subscription.isPattern) {
      return false;
    }
    
    const patternSubs = this.patternSubscriptions.get(subscription.pattern);
    if (patternSubs) {
      const index = patternSubs.findIndex(sub => sub.id === id);
      if (index !== -1) {
        patternSubs.splice(index, 1);
        if (patternSubs.length === 0) {
          this.patternSubscriptions.delete(subscription.pattern);
        }
      }
    }
    
    this.subscriptions.delete(id);
    logger.debug('Unsubscribed from pattern', { pattern: subscription.pattern, id });
    return true;
  }

  pubsubChannels(pattern?: string): string[] {
    const channels = Array.from(this.subscriberCount.keys());
    
    if (pattern) {
      return channels.filter(channel => this.matchPattern(pattern, channel));
    }
    
    return channels;
  }

  pubsubNumsub(...channels: string[]): Record<string, number> {
    const result: Record<string, number> = {};
    
    for (const channel of channels) {
      result[channel] = this.subscriberCount.get(channel) || 0;
    }
    
    return result;
  }

  pubsubNumpat(): number {
    let count = 0;
    for (const subs of this.patternSubscriptions.values()) {
      count += subs.length;
    }
    return count;
  }

  private matchPattern(pattern: string, channel: string): boolean {
    // Convert Redis-style pattern to regex
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/\*/g, '.*') // * -> .*
      .replace(/\?/g, '.'); // ? -> .
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(channel);
  }

  async destroy(): Promise<void> {
    this.channels.removeAllListeners();
    this.subscriptions.clear();
    this.patternSubscriptions.clear();
    this.subscriberCount.clear();
    logger.info('PubSubPlugin destroyed');
  }
}