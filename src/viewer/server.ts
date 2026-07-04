import { createServer, type Server, type ServerResponse } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeFlow } from '../map/flow-map.js';
import { readRunArtifact, updateFinding } from '../report/artifact.js';

/**
 * The thin viewer over a Run artifact (ADR-0004): serves the built lumen
 * viewer (dist/viewer) plus the artifact's files. Resolution actions
 * (Dismiss / Reject / Suppress — one per Finding tier) are plain file edits
 * against the repo's Flow Map; they only work when a repoRoot is provided
 * (the Report is portable, the Flow Map is not). This server must stay dumb:
 * no LLM, no agent execution.
 */
export interface Viewer {
  url: string;
  server: Server;
}

/** dist/viewer sits at the package root beside src/ and dist/ — this resolves identically from both. */
const VIEWER_DIST = fileURLToPath(new URL('../../dist/viewer/', import.meta.url));

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webm': 'video/webm',
};

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendStatus(res: ServerResponse, status: number): void {
  res.writeHead(status);
  res.end();
}

async function sendFile(res: ServerResponse, path: string): Promise<void> {
  let data: Buffer;
  try {
    data = await readFile(path);
  } catch {
    sendStatus(res, 404);
    return;
  }
  res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(path)] ?? 'application/octet-stream' });
  res.end(data);
}

/** decodeURIComponent that reports malformed input instead of throwing. */
function decodePath(component: string): string | null {
  try {
    return decodeURIComponent(component);
  } catch {
    return null;
  }
}

/** Suppress (CONTEXT.md): record the Advisory's title so future Runs stop re-reporting it. */
async function suppressTitle(repoRoot: string, title: string): Promise<void> {
  const file = join(repoRoot, '.autoend', 'suppressed.json');
  let advisories: string[] = [];
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8')) as { advisories?: unknown };
    if (Array.isArray(parsed.advisories)) {
      advisories = parsed.advisories.filter((t): t is string => typeof t === 'string');
    }
  } catch {
    // First use or corrupt file: start fresh.
  }
  if (!advisories.includes(title)) advisories.push(title);
  await mkdir(join(repoRoot, '.autoend'), { recursive: true });
  await writeFile(file, JSON.stringify({ advisories }, null, 2));
}

/**
 * Dismiss and Suppress edit both stores: the Flow Map (the durable decision)
 * and report.json (so a viewer reload reflects it). Reject needs a Heal to
 * revert, and Heals are not produced yet (ADR-0006 follow-up).
 */
async function resolveFinding(
  artifactDir: string,
  repoRoot: string | undefined,
  id: string,
  action: 'dismiss' | 'suppress' | 'reject',
  res: ServerResponse,
): Promise<void> {
  if (action === 'reject') {
    sendJson(res, 501, { error: 'Reject requires Heals, which are not produced yet (ADR-0006 follow-up)' });
    return;
  }
  if (!repoRoot) {
    sendJson(res, 501, { error: 'resolution actions only work where the Flow Map lives — this Report is being viewed away from its repo' });
    return;
  }
  const artifact = await readRunArtifact(artifactDir);
  const finding = artifact.findings.find((f) => f.id === id);
  if (!finding) {
    sendJson(res, 404, { error: `unknown finding "${id}"` });
    return;
  }
  if (action === 'dismiss') {
    if (finding.kind !== 'regression' || !finding.flowId) {
      sendJson(res, 409, { error: 'Dismiss applies only to Regressions attached to a Flow' });
      return;
    }
    await removeFlow(repoRoot, finding.flowId);
    await updateFinding(artifactDir, id, { resolution: 'dismissed' });
  } else {
    if (finding.kind !== 'advisory') {
      sendJson(res, 409, { error: 'Suppress applies only to Advisories' });
      return;
    }
    await suppressTitle(repoRoot, finding.title);
    await updateFinding(artifactDir, id, { resolution: 'suppressed' });
  }
  sendJson(res, 200, { ok: true });
}

export function serveReport(artifactDir: string, port = 0, repoRoot?: string): Promise<Viewer> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/api/report') {
        const report = await readFile(join(artifactDir, 'report.json'));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(report);
      } else if (req.method === 'GET' && url.pathname === '/api/capabilities') {
        sendJson(res, 200, { resolutionActions: Boolean(repoRoot) });
      } else if (req.method === 'GET' && url.pathname.startsWith('/evidence/')) {
        const name = decodePath(url.pathname.slice('/evidence/'.length));
        if (name === null || name !== normalize(name) || name.startsWith('..') || name.includes('/')) {
          sendStatus(res, 400);
          return;
        }
        await sendFile(res, join(artifactDir, 'evidence', name));
      } else if (req.method === 'POST') {
        const match = /^\/api\/findings\/([^/]+)\/(dismiss|suppress|reject)$/.exec(url.pathname);
        const id = match && decodePath(match[1]);
        if (!match || id === null) {
          sendStatus(res, 404);
          return;
        }
        await resolveFinding(artifactDir, repoRoot, id, match[2] as 'dismiss' | 'suppress' | 'reject', res);
      } else if (req.method === 'GET') {
        // The built viewer: `/` is index.html (hash routing — no history
        // fallback needed), everything else resolves inside dist/viewer.
        const decoded = decodePath(url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
        const rel = decoded === null ? null : normalize(decoded);
        if (rel === null || rel.startsWith('..') || isAbsolute(rel)) {
          sendStatus(res, 400);
          return;
        }
        await sendFile(res, join(VIEWER_DIST, rel));
      } else {
        sendStatus(res, 404);
      }
    } catch {
      sendStatus(res, 500);
    }
  });

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const address = server.address();
      const actualPort = typeof address === 'object' && address ? address.port : port;
      resolve({ url: `http://127.0.0.1:${actualPort}/`, server });
    });
  });
}
