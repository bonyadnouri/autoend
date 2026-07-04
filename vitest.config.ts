import { defineConfig } from 'vitest/config';

// Only the real suite: stray checkouts (e.g. .claude/worktrees/*) carry their
// own test/ copies that vitest's default glob would run and double-count.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
});
