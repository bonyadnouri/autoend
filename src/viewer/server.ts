import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { VIEWER_HTML } from './html.js';

/**
 * The thin viewer over a Run artifact (ADR-0004): reads files, renders the
 * Report. Resolution actions (Dismiss / Reject / Suppress — one per Finding
 * tier) are plain file edits against the repo; they are stubbed 501 until the
 * Flow Map operations behind them exist. This server must stay dumb: no LLM,
 * no agent execution.
 */
export interface Viewer {
  url: string;
  server: Server;
}

export function serveReport(artifactDir: string, port = 0): Promise<Viewer> {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(VIEWER_HTML);
      } else if (req.method === 'GET' && url.pathname === '/api/report') {
        const report = await readFile(join(artifactDir, 'report.json'));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(report);
      } else if (req.method === 'GET' && url.pathname.startsWith('/evidence/')) {
        const name = normalize(url.pathname.slice('/evidence/'.length));
        if (name.startsWith('..') || name.includes('/')) {
          res.writeHead(400);
          res.end();
          return;
        }
        const video = await readFile(join(artifactDir, 'evidence', name));
        res.writeHead(200, { 'content-type': 'video/webm' });
        res.end(video);
      } else if (req.method === 'POST' && /^\/api\/findings\/[^/]+\/(dismiss|reject|suppress)$/.test(url.pathname)) {
        // TODO(ADR-0004): Dismiss (Regression -> delete Flow), Reject (Heal ->
        // revert script, refile as Regression), Suppress (Advisory -> stop
        // re-reporting). All plain file edits against the Flow Map.
        res.writeHead(501, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'resolution actions are not implemented yet' }));
      } else {
        res.writeHead(404);
        res.end();
      }
    } catch {
      res.writeHead(500);
      res.end();
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
