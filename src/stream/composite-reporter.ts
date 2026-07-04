import type { RunReporter } from './reporter.js';

function safe(reporter: RunReporter, method: keyof RunReporter, args: unknown[]): Promise<void> {
  const fn = reporter[method] as (...a: unknown[]) => Promise<void>;
  return fn.apply(reporter, args).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`reporter.${String(method)} failed: ${message}`);
  });
}

/** Fan-out reporter; each sink is isolated — one failure must not block others. */
export class CompositeReporter implements RunReporter {
  constructor(private readonly reporters: RunReporter[]) {}

  async runStarted(info): Promise<void> {
    await Promise.all(this.reporters.map((r) => safe(r, 'runStarted', [info])));
  }

  async runFinished(summary): Promise<void> {
    await Promise.all(this.reporters.map((r) => safe(r, 'runFinished', [summary])));
  }

  async event(event): Promise<void> {
    await Promise.all(this.reporters.map((r) => safe(r, 'event', [event])));
  }

  async screenSeen(screen): Promise<void> {
    await Promise.all(this.reporters.map((r) => safe(r, 'screenSeen', [screen])));
  }

  async edgeSeen(edge): Promise<void> {
    await Promise.all(this.reporters.map((r) => safe(r, 'edgeSeen', [edge])));
  }

  async testStatus(update): Promise<void> {
    await Promise.all(this.reporters.map((r) => safe(r, 'testStatus', [update])));
  }
}
