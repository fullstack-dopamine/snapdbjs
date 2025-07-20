/**
 * Base plugin class for SnapDBJS
 */

import { Plugin as IPlugin, ISnapDB } from '../types';

export abstract class Plugin<K = string, V = any> implements IPlugin<K, V> {
  abstract name: string;
  abstract version: string;

  abstract init(store: ISnapDB<K, V>): void;

  protected addCommand(
    store: ISnapDB<K, V>,
    name: string,
    handler: (args: any) => Promise<any>
  ): void {
    (store as any)[name] = handler;
  }
}