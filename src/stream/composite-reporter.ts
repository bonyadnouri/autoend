import type { RunEvent } from './events.js';
import type { EdgeFact, RunReporter, RunStartedInfo, RunSummary, ScreenFact, TestStatusFact } from './reporter.js';

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

  async runStarted(info: RunStartedInfo): Promise<void> {
    await Promise.all(this.reporters.map((r) => safe(r, 'runStarted', [info])));
  }

  async runFinished(summary: RunSummary): Promise<void> {
    await Promise.all(this.reporters.map((r) => safe(r, 'runFinished', [summary])));
  }

  async event(event: RunEvent): Promise<void> {
    await Promise.all(this.reporters.map((r) => safe(r, 'event', [event])));
  }

  async screenSeen(screen: ScreenFact): Promise<void> {
    await Promise.all(this.reporters.map((r) => safe(r, 'screenSeen', [screen])));
  }

  async screenDropped(id: string): Promise<void> {
    await Promise.all(this.reporters.map((r) => safe(r, 'screenDropped', [id])));
  }

  async edgeSeen(edge: EdgeFact): Promise<void> {
    await Promise.all(this.reporters.map((r) => safe(r, 'edgeSeen', [edge])));
  }

  async testStatus(update: TestStatusFact): Promise<void> {
    await Promise.all(this.reporters.map((r) => safe(r, 'testStatus', [update])));
  }

  async flush(): Promise<void> {
    await Promise.all(this.reporters.map((r) => safe(r, 'flush', [])));
  }
}
