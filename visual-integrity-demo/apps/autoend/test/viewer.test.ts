import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readRunArtifact } from '../src/report/artifact.js';
import type { Finding, RunArtifact } from '../src/report/types.js';
import { filterSuppressed } from '../src/run/run.js';
import { serveReport } from '../src/viewer/server.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VIEWER_DIST = join(ROOT, 'dist', 'spa');

// Build the lumen viewer bundle (dist/spa) once if absent — the server under test serves it.
beforeAll(() => {
  if (!existsSync(join(VIEWER_DIST, 'index.html'))) {
    execSync('npm run build:viewer', { cwd: ROOT, stdio: 'inherit' });
  }
}, 180_000);

const REGRESSION: Finding = {
  id: 'f-reg',
  kind: 'regression',
  flowId: 'checkout',
  title: 'Checkout flow no longer completes',
  detail: 'Payment step fails.',
};

const ADVISORY: Finding = {
  id: 'f-adv',
  kind: 'advisory',
  title: 'Console warning on pricing page',
  detail: 'Deprecated API usage.',
};

function makeArtifact(): RunArtifact {
  return {
    runId: 'run-1',
    target: 'https://example.com/',
    effort: 'low',
    startedAt: new Date().toISOString(),
    flowsReplayed: 1,
    flowsDiscovered: 0,
    flows: [],
    environment: {
      browser: 'Chromium (not launched)',
      viewport: '1280×720',
      os: 'test 0.0',
      node: process.version,
      autoendVersion: '0.0.0',
    },
    findings: [structuredClone(REGRESSION), structuredClone(ADVISORY)],
    heals: [],
  };
}

const cleanups: Array<() => Promise<unknown>> = [];
afterAll(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup();
});

interface Fixture {
  url: string;
  artifactDir: string;
  repoRoot?: string;
}

/** A real temp Run artifact (+ optional temp repo with a Flow Map), served over HTTP. */
async function startViewer(withRepo: boolean): Promise<Fixture> {
  const artifactDir = await mkdtemp(join(tmpdir(), 'autoend-artifact-'));
  cleanups.push(() => rm(artifactDir, { recursive: true, force: true }));
  await mkdir(join(artifactDir, 'evidence'), { recursive: true });
  await writeFile(join(artifactDir, 'report.json'), JSON.stringify(makeArtifact(), null, 2));
  await writeFile(join(artifactDir, 'evidence', 'clip.webm'), Buffer.from('webm-bytes'));
  await writeFile(join(artifactDir, 'evidence', 'shot.png'), Buffer.from('png-bytes'));

  let repoRoot: string | undefined;
  if (withRepo) {
    repoRoot = await mkdtemp(join(tmpdir(), 'autoend-repo-'));
    const captured = repoRoot;
    cleanups.push(() => rm(captured, { recursive: true, force: true }));
    const flowDir = join(repoRoot, '.autoend', 'flows', 'checkout');
    await mkdir(flowDir, { recursive: true });
    await writeFile(
      join(flowDir, 'flow.json'),
      JSON.stringify({ id: 'checkout', title: 'Checkout', discoveredAt: new Date().toISOString() }),
    );
    await writeFile(join(flowDir, 'flow.mts'), '// script\n');
  }

  const viewer = await serveReport(artifactDir, 0, repoRoot);
  cleanups.push(() => new Promise<void>((resolve) => viewer.server.close(() => resolve())));
  return { url: viewer.url, artifactDir, repoRoot };
}

/** Raw GET that bypasses fetch's URL normalization — needed to exercise ../ traversal. */
function rawStatus(base: string, path: string): Promise<number> {
  const { hostname, port } = new URL(base);
  return new Promise((resolve, reject) => {
    const req = request({ hostname, port, path, method: 'GET' }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode ?? 0));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('static viewer', () => {
  it('serves the built lumen viewer at /', async () => {
    const { url } = await startViewer(true);
    const res = await fetch(url);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('<div id="root">');
  });

  it('serves bundle assets with the right content-type', async () => {
    const { url } = await startViewer(true);
    const assets = await readdir(join(VIEWER_DIST, 'assets'));
    const js = assets.find((name) => name.endsWith('.js'));
    expect(js).toBeDefined();
    const res = await fetch(new URL(`assets/${js}`, url));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/javascript');
  });

  it('rejects paths that escape the SPA root', async () => {
    const { url } = await startViewer(true);
    expect([400, 404]).toContain(await rawStatus(url, '/assets/../../package.json'));
  });

  it('does not serve the compiled server bundle from the SPA root', async () => {
    const { url } = await startViewer(true);
    expect(await rawStatus(url, '/server.js')).toBe(404);
  });
});

describe('report and evidence', () => {
  it('serves report.json at /api/report', async () => {
    const { url } = await startViewer(true);
    const res = await fetch(new URL('api/report', url));
    expect(res.status).toBe(200);
    const report = (await res.json()) as RunArtifact;
    expect(report.findings.map((f) => f.id)).toEqual(['f-reg', 'f-adv']);
  });

  it('serves evidence with content-type by extension', async () => {
    const { url } = await startViewer(true);
    const webm = await fetch(new URL('evidence/clip.webm', url));
    expect(webm.status).toBe(200);
    expect(webm.headers.get('content-type')).toBe('video/webm');
    const png = await fetch(new URL('evidence/shot.png', url));
    expect(png.status).toBe(200);
    expect(png.headers.get('content-type')).toBe('image/png');
  });

  // Chrome refuses to seek a <video> served without byte ranges — the click-timeline-to-seek
  // feature needs 206 responses from this production server, not just the dev middleware.
  it('serves a 206 partial for a valid Range', async () => {
    const { url } = await startViewer(true);
    const res = await fetch(new URL('evidence/clip.webm', url), { headers: { Range: 'bytes=0-3' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 0-3/10');
    expect(res.headers.get('content-length')).toBe('4');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(await res.text()).toBe('webm'); // first 4 bytes of 'webm-bytes'
  });

  it('416s an unsatisfiable Range', async () => {
    const { url } = await startViewer(true);
    const res = await fetch(new URL('evidence/clip.webm', url), { headers: { Range: 'bytes=10-' } });
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */10');
  });

  it('serves the full body with 200 and advertises byte ranges when no Range is sent', async () => {
    const { url } = await startViewer(true);
    const res = await fetch(new URL('evidence/clip.webm', url));
    expect(res.status).toBe(200);
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(await res.text()).toBe('webm-bytes');
  });
});

describe('capabilities', () => {
  it('advertises resolution actions when the repo is reachable', async () => {
    const { url } = await startViewer(true);
    const res = await fetch(new URL('api/capabilities', url));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ resolutionActions: true });
  });

  it('advertises no resolution actions without a repoRoot', async () => {
    const { url } = await startViewer(false);
    const res = await fetch(new URL('api/capabilities', url));
    expect(await res.json()).toEqual({ resolutionActions: false });
  });
});

describe('dismiss', () => {
  it('deletes the Flow from the map and records the resolution', async () => {
    const { url, artifactDir, repoRoot } = await startViewer(true);
    const res = await fetch(new URL('api/findings/f-reg/dismiss', url), { method: 'POST' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(existsSync(join(repoRoot!, '.autoend', 'flows', 'checkout'))).toBe(false);
    const artifact = await readRunArtifact(artifactDir);
    expect(artifact.findings.find((f) => f.id === 'f-reg')?.resolution).toBe('dismissed');
  });

  it('409s on a non-Regression Finding', async () => {
    const { url } = await startViewer(true);
    const res = await fetch(new URL('api/findings/f-adv/dismiss', url), { method: 'POST' });
    expect(res.status).toBe(409);
  });

  it('404s on an unknown Finding id', async () => {
    const { url } = await startViewer(true);
    const res = await fetch(new URL('api/findings/nope/dismiss', url), { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('501s when the artifact is viewed away from the repo', async () => {
    const { url } = await startViewer(false);
    const res = await fetch(new URL('api/findings/f-reg/dismiss', url), { method: 'POST' });
    expect(res.status).toBe(501);
  });
});

describe('suppress', () => {
  it('appends the title to suppressed.json, idempotently', async () => {
    const { url, artifactDir, repoRoot } = await startViewer(true);
    const first = await fetch(new URL('api/findings/f-adv/suppress', url), { method: 'POST' });
    expect(first.status).toBe(200);
    const second = await fetch(new URL('api/findings/f-adv/suppress', url), { method: 'POST' });
    expect(second.status).toBe(200);
    const raw = await readFile(join(repoRoot!, '.autoend', 'suppressed.json'), 'utf8');
    expect(JSON.parse(raw)).toEqual({ advisories: [ADVISORY.title] });
    const artifact = await readRunArtifact(artifactDir);
    expect(artifact.findings.find((f) => f.id === 'f-adv')?.resolution).toBe('suppressed');
  });

  it('409s on a non-Advisory Finding', async () => {
    const { url } = await startViewer(true);
    const res = await fetch(new URL('api/findings/f-reg/suppress', url), { method: 'POST' });
    expect(res.status).toBe(409);
  });
});

describe('reject', () => {
  it('501s until Heals are produced', async () => {
    const { url } = await startViewer(true);
    const res = await fetch(new URL('api/findings/f-reg/reject', url), { method: 'POST' });
    expect(res.status).toBe(501);
    expect(await res.json()).toEqual({
      error: 'Reject requires Heals, which are not produced yet (ADR-0006 follow-up)',
    });
  });
});

describe('filterSuppressed', () => {
  it('drops only Advisories whose title is suppressed', () => {
    const findings = [structuredClone(REGRESSION), structuredClone(ADVISORY)];
    const kept = filterSuppressed(findings, [ADVISORY.title, REGRESSION.title]);
    expect(kept.map((f) => f.id)).toEqual(['f-reg']);
  });

  it('keeps everything when nothing is suppressed', () => {
    const findings = [structuredClone(REGRESSION), structuredClone(ADVISORY)];
    expect(filterSuppressed(findings, [])).toEqual(findings);
  });
});
