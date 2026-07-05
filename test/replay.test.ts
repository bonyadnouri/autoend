import { createServer, type Server } from 'node:http';
import { access, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addFlow, listFlows } from '../src/map/flow-map.js';
import { replayFlowMap, runFlowScript } from '../src/replay/replay.js';

const PAGE = `<!doctype html><html><body>
<button id="btn" onclick="document.getElementById('out').textContent='clicked'">Go</button>
<div id="out"></div>
</body></html>`;

// Emits a console error and requests an image that 404s — exercises every capture stream.
const CAPTURE_PAGE = `<!doctype html><html><body>
<script>console.error('boom')</script>
<img src="/missing.png">
</body></html>`;

const CAPTURE_FLOW = `export default async function flow(page, target) {
  await page.goto(new URL('/capture', target).href);
}
`;

const THROWING_FLOW = `export default async function flow(page, target) {
  await page.goto(new URL('/capture', target).href);
  throw new Error('nope');
}
`;

// Navigates to a real page, then follows a link to a document that 404s.
const MISSING_PAGE_FLOW = `export default async function flow(page, target) {
  await page.goto(new URL('/', target).href);
  await page.goto(new URL('/gone', target).href);
}
`;

// Flow scripts are plain JS-in-.ts so Node's native type stripping always applies.
const PASSING_FLOW = `export default async function flow(page, target) {
  await page.goto(new URL('/', target).href);
  await page.click('#btn');
  const text = await page.textContent('#out');
  if (text !== 'clicked') throw new Error('expected "clicked", got ' + JSON.stringify(text));
}
`;

const FAILING_FLOW = `export default async function flow(page, target) {
  await page.goto(new URL('/', target).href);
  await page.click('#does-not-exist', { timeout: 1500 });
}
`;

let repo: string;
let server: Server;
let target: URL;

beforeAll(async () => {
  repo = await mkdtemp(join(tmpdir(), 'autoend-replay-'));
  server = createServer((req, res) => {
    if (req.url === '/missing.png') {
      res.writeHead(404).end();
      return;
    }
    // A real document 404 — the destination the app links to but that isn't a page.
    if (req.url === '/gone') {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<!doctype html><html><body><h1>Not found</h1></body></html>');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(req.url === '/capture' ? CAPTURE_PAGE : PAGE);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  target = new URL(`http://127.0.0.1:${port}/`);
});

afterAll(async () => {
  server.close();
  await rm(repo, { recursive: true, force: true });
});

describe('replay engine', () => {
  it('replays the map, records Evidence, updates lastPassedAt, and files Regressions', async () => {
    const now = new Date().toISOString();
    await addFlow(repo, { id: 'click-button', title: 'Visitor clicks the button', discoveredAt: now }, PASSING_FLOW);
    await addFlow(repo, { id: 'broken-flow', title: 'A flow the app no longer supports', discoveredAt: now }, FAILING_FLOW);
    const evidenceDir = join(repo, 'evidence');
    await mkdir(evidenceDir, { recursive: true });

    const result = await replayFlowMap(repo, target, await listFlows(repo), evidenceDir);

    expect(result.replayed).toBe(2);

    // exactly one Regression, for the broken flow, with Evidence attached
    expect(result.findings).toHaveLength(1);
    const finding = result.findings[0];
    expect(finding.kind).toBe('regression');
    expect(finding.flowId).toBe('broken-flow');
    expect(finding.evidence).toBe('broken-flow.webm');

    // both flows produced non-empty WebM Evidence
    for (const name of ['click-button.webm', 'broken-flow.webm']) {
      await access(join(evidenceDir, name));
      expect((await stat(join(evidenceDir, name))).size).toBeGreaterThan(0);
    }

    // the green flow's baseline timestamp advanced; the broken one's did not
    const flows = await listFlows(repo);
    expect(flows.find((f) => f.id === 'click-button')?.lastPassedAt).toBeDefined();
    expect(flows.find((f) => f.id === 'broken-flow')?.lastPassedAt).toBeUndefined();
  }, 90_000);
});

describe('flow capture', () => {
  let browser: Browser;

  beforeAll(async () => {
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser.close();
  });

  it('captures console errors, failed network, timeline, and screenshots', async () => {
    const scriptPath = join(repo, 'capture-flow.mts');
    await writeFile(scriptPath, CAPTURE_FLOW);
    const evidenceDir = join(repo, 'evidence-cap');
    await mkdir(evidenceDir, { recursive: true });

    const outcome = await runFlowScript(browser, scriptPath, target, evidenceDir, 'cap');
    expect(outcome.ok).toBe(true);
    expect(outcome.console.some((c) => c.level === 'error' && c.text.includes('boom'))).toBe(true);
    expect(outcome.network.some((n) => n.status === 404 && n.url.endsWith('/missing.png'))).toBe(true);
    expect(outcome.timeline[0]).toMatchObject({ label: 'goto /capture', status: 'passed' });
    expect(outcome.screenshots.map((s) => s.label)).toEqual(['before', 'after']);
    for (const s of outcome.screenshots) {
      await expect(access(join(evidenceDir, s.file))).resolves.toBeUndefined();
    }
  }, 30_000);

  it('never records a screen for an HTTP 404 destination and reports it as a bad screen', async () => {
    const scriptPath = join(repo, 'missing-page-flow.mts');
    await writeFile(scriptPath, MISSING_PAGE_FLOW);
    const evidenceDir = join(repo, 'evidence-404');
    await mkdir(evidenceDir, { recursive: true });

    const seen: string[] = [];
    const dropped: string[] = [];
    const reporter = {
      runStarted: async () => {},
      runFinished: async () => {},
      event: async () => {},
      screenSeen: async (s: { id: string }) => {
        seen.push(s.id);
      },
      screenDropped: async (id: string) => {
        dropped.push(id);
      },
      edgeSeen: async () => {},
      testStatus: async () => {},
    };

    const outcome = await runFlowScript(browser, scriptPath, target, evidenceDir, '404', { reporter });

    // The 404 page is not a real screen.
    expect(outcome.visitedScreenIds).toContain('/');
    expect(outcome.visitedScreenIds).not.toContain('/gone');
    expect(outcome.badScreens).toEqual([{ id: '/gone', status: 404 }]);
    // It never persists as a screen: either suppressed up front or dropped after.
    const goneWasSeen = seen.includes('/gone');
    expect(goneWasSeen ? dropped.includes('/gone') : true).toBe(true);
    // Ending on a 404 is a semantic failure.
    expect(outcome.badEndState).toContain('404');
  }, 30_000);

  it('labels the terminal screenshot at-failure and the terminal step failed on a throwing flow', async () => {
    const scriptPath = join(repo, 'throwing-flow.mts');
    await writeFile(scriptPath, THROWING_FLOW);
    const evidenceDir = join(repo, 'evidence-fail');
    await mkdir(evidenceDir, { recursive: true });

    const outcome = await runFlowScript(browser, scriptPath, target, evidenceDir, 'fail');
    expect(outcome.ok).toBe(false);
    expect(outcome.screenshots.at(-1)?.label).toBe('at-failure');
    expect(outcome.timeline.at(-1)).toMatchObject({ status: 'failed' });
  }, 30_000);

  it('replayFlowMap returns FlowSnapshots and attaches capture to Regression findings', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'autoend-snap-'));
    const now = new Date().toISOString();
    await addFlow(repoRoot, { id: 'cap-pass', title: 'Loads the capture page', discoveredAt: now }, CAPTURE_FLOW);
    await addFlow(repoRoot, { id: 'cap-fail', title: 'Throws after loading', discoveredAt: now }, THROWING_FLOW);
    const evidenceDir = join(repoRoot, 'evidence');
    await mkdir(evidenceDir, { recursive: true });
    const flows = await listFlows(repoRoot);

    const result = await replayFlowMap(repoRoot, target, flows, evidenceDir);
    expect(result.flows).toHaveLength(2);
    expect(result.flows.find((f) => f.status === 'failed')).toBeDefined();
    const regression = result.findings[0];
    expect(regression.screenshots?.at(-1)?.label).toBe('at-failure');
    expect(regression.timeline?.length).toBeGreaterThan(0);

    await rm(repoRoot, { recursive: true, force: true });
  }, 90_000);
});
