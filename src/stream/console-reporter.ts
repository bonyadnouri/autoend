import pc from 'picocolors';
import type { RunEvent } from './events.js';
import type { RunReporter, RunStartedInfo, RunSummary } from './reporter.js';

function formatEvent(event: RunEvent): string {
  switch (event.type) {
    case 'log':
      return event.level === 'warn' ? pc.yellow(event.message) : event.message;
    case 'phase':
      return pc.cyan(`${event.phase} ${event.state}`);
    case 'flow':
      return `${pc.bold(event.title)} ${event.state}`;
    case 'screen':
      return `screen ${event.path} ${event.state}`;
    case 'explorer':
      return `explorer ${event.name} ${event.state}`;
    case 'finding':
      return pc.red(`finding [${event.kind}] ${event.title}`);
    default:
      return JSON.stringify(event);
  }
}

export class ConsoleReporter implements RunReporter {
  async runStarted(info: RunStartedInfo): Promise<void> {
    console.log(pc.cyan(`run ${info.runId} started`) + pc.dim(` · ${info.kind} · ${info.effort}`));
  }

  async runFinished(summary: RunSummary): Promise<void> {
    const color = summary.status === 'finished' ? pc.green : pc.red;
    console.log(color(`run ${summary.runId} ${summary.status}`) + (summary.error ? pc.dim(` · ${summary.error}`) : ''));
  }

  async event(event: RunEvent): Promise<void> {
    console.log(pc.dim('  ') + formatEvent(event));
  }

  async screenSeen(): Promise<void> {}
  async screenDropped(id: string): Promise<void> {
    console.log(pc.dim('  ') + pc.yellow(`screen dropped (404) ${id}`));
  }
  async edgeSeen(): Promise<void> {}
  async testStatus(): Promise<void> {}
}
