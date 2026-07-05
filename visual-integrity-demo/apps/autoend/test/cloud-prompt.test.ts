import { describe, expect, it } from 'vitest';
import { buildAutoendCloudPrompt } from '../src/cloud/prompt.js';

describe('buildAutoendCloudPrompt', () => {
  it('tells a cloud-env profile not to reinstall dependencies', () => {
    const prompt = buildAutoendCloudPrompt('cloud-env');
    expect(prompt).toMatch(/pre-installed in this saved environment snapshot/);
    expect(prompt).not.toMatch(/npx playwright install --with-deps chromium`;/);
  });

  it('tells a cloud-repo profile how to install if needed', () => {
    const prompt = buildAutoendCloudPrompt('cloud-repo');
    expect(prompt).toMatch(/pnpm install --frozen-lockfile/);
  });

  it('always points at the thin runner script', () => {
    expect(buildAutoendCloudPrompt('cloud-env')).toMatch(/bash apps\/autoend\/scripts\/run-autoend-cloud\.sh/);
  });

  it('always forbids the setup wizard and viewer', () => {
    const prompt = buildAutoendCloudPrompt('cloud-repo');
    expect(prompt).toMatch(/Do NOT run `autoend init`/);
    expect(prompt).toMatch(/Do NOT attempt to open a browser or start a viewer server/);
  });
});
