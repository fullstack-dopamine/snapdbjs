/**
 * Metrics collection middleware for SnapDBJS
 */

import { MiddlewareFn, CommandContext, CommandType } from '../types';

export interface Metrics {
  commands: Record<CommandType, CommandMetrics>;
  totalCommands: number;
  totalErrors: number;
  startTime: number;
}

export interface CommandMetrics {
  count: number;
  errors: number;
  totalDuration: number;
  minDuration: number;
  maxDuration: number;
  lastExecuted: number;
}

export class MetricsMiddleware<K = string, V = any> {
  private metrics: Metrics;

  constructor() {
    this.metrics = {
      commands: {} as Record<CommandType, CommandMetrics>,
      totalCommands: 0,
      totalErrors: 0,
      startTime: Date.now()
    };
  }

  middleware(): MiddlewareFn<K, V> {
    return async (ctx: CommandContext<K, V>, next) => {
      const startTime = Date.now();
      
      // Initialize metrics for this command if needed
      if (!this.metrics.commands[ctx.command]) {
        this.metrics.commands[ctx.command] = {
          count: 0,
          errors: 0,
          totalDuration: 0,
          minDuration: Infinity,
          maxDuration: 0,
          lastExecuted: 0
        };
      }

      const cmdMetrics = this.metrics.commands[ctx.command];
      
      try {
        const result = await next();
        const duration = Date.now() - startTime;
        
        // Update metrics
        cmdMetrics.count++;
        cmdMetrics.totalDuration += duration;
        cmdMetrics.minDuration = Math.min(cmdMetrics.minDuration, duration);
        cmdMetrics.maxDuration = Math.max(cmdMetrics.maxDuration, duration);
        cmdMetrics.lastExecuted = Date.now();
        this.metrics.totalCommands++;
        
        return result;
      } catch (error) {
        const duration = Date.now() - startTime;
        
        // Update error metrics
        cmdMetrics.errors++;
        cmdMetrics.totalDuration += duration;
        this.metrics.totalErrors++;
        
        throw error;
      }
    };
  }

  getMetrics(): Metrics {
    return {
      ...this.metrics,
      commands: { ...this.metrics.commands }
    };
  }

  getCommandMetrics(command: CommandType): CommandMetrics | undefined {
    return this.metrics.commands[command];
  }

  getAverageLatency(command?: CommandType): number {
    if (command) {
      const cmdMetrics = this.metrics.commands[command];
      if (!cmdMetrics || cmdMetrics.count === 0) return 0;
      return cmdMetrics.totalDuration / cmdMetrics.count;
    }

    // Calculate overall average
    let totalDuration = 0;
    let totalCount = 0;
    
    for (const cmd of Object.values(this.metrics.commands)) {
      totalDuration += cmd.totalDuration;
      totalCount += cmd.count;
    }
    
    return totalCount > 0 ? totalDuration / totalCount : 0;
  }

  reset(): void {
    this.metrics = {
      commands: {} as Record<CommandType, CommandMetrics>,
      totalCommands: 0,
      totalErrors: 0,
      startTime: Date.now()
    };
  }

  toPrometheusFormat(): string {
    const lines: string[] = [];
    const uptime = Date.now() - this.metrics.startTime;

    // Overall metrics
    lines.push(`# HELP snapdb_commands_total Total number of commands executed`);
    lines.push(`# TYPE snapdb_commands_total counter`);
    lines.push(`snapdb_commands_total ${this.metrics.totalCommands}`);

    lines.push(`# HELP snapdb_errors_total Total number of errors`);
    lines.push(`# TYPE snapdb_errors_total counter`);
    lines.push(`snapdb_errors_total ${this.metrics.totalErrors}`);

    lines.push(`# HELP snapdb_uptime_seconds Uptime in seconds`);
    lines.push(`# TYPE snapdb_uptime_seconds gauge`);
    lines.push(`snapdb_uptime_seconds ${uptime / 1000}`);

    // Per-command metrics
    for (const [command, metrics] of Object.entries(this.metrics.commands)) {
      lines.push(`# HELP snapdb_command_count Number of times command was executed`);
      lines.push(`# TYPE snapdb_command_count counter`);
      lines.push(`snapdb_command_count{command="${command}"} ${metrics.count}`);

      lines.push(`# HELP snapdb_command_errors Number of errors for command`);
      lines.push(`# TYPE snapdb_command_errors counter`);
      lines.push(`snapdb_command_errors{command="${command}"} ${metrics.errors}`);

      if (metrics.count > 0) {
        const avgLatency = metrics.totalDuration / metrics.count;
        lines.push(`# HELP snapdb_command_latency_ms Command latency in milliseconds`);
        lines.push(`# TYPE snapdb_command_latency_ms gauge`);
        lines.push(`snapdb_command_latency_ms{command="${command}",type="avg"} ${avgLatency}`);
        lines.push(`snapdb_command_latency_ms{command="${command}",type="min"} ${metrics.minDuration}`);
        lines.push(`snapdb_command_latency_ms{command="${command}",type="max"} ${metrics.maxDuration}`);
      }
    }

    return lines.join('\n');
  }
}