import { createServer, type Server } from 'node:http';
import { access, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addFlow, listFlows } from '../src/map/flow-map.js';
import { replayFlowMap } from '../src/replay/replay.js';

const PAGE = `<!doctype html><html><body>
<button id="btn" onclick="document.getElementById('out').textContent='clicked'">Go</button>
<div id="out"></div>
</body></html>`;

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
  server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(PAGE);
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
