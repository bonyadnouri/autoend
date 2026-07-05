import type { RunReporter } from './reporter.js';

const noop = async (): Promise<void> => {};

export const NoopReporter: RunReporter = {
  runStarted: noop,
  runFinished: noop,
  event: noop,
  screenSeen: noop,
  screenDropped: noop,
  edgeSeen: noop,
  testStatus: noop,
};
