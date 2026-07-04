// viewer/vite.config.ts
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

/** Dev-only: serve the fixture Report the way the thin server / static hosting would. */
function fixtureReport(): Plugin {
  const fixtures = join(__dirname, 'fixtures');
  const mime: Record<string, string> = { '.json': 'application/json', '.webm': 'video/webm', '.png': 'image/png' };
  return {
    name: 'autoend-fixture-report',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? '').split('?')[0];
        const file =
          url === '/api/report' || url === '/report.json'
            ? join(fixtures, 'report.json')
            : url === '/api/capabilities'
              ? null
              : url.startsWith('/evidence/')
                ? join(fixtures, 'evidence', url.slice('/evidence/'.length))
                : undefined;
        if (url === '/api/capabilities') {
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ resolutionActions: true }));
          return;
        }
        if (!file) return next();
        try {
          const body = await readFile(file);
          res.setHeader('content-type', mime[extname(file)] ?? 'application/octet-stream');
          res.end(body);
        } catch {
          res.statusCode = 404;
          res.end();
        }
      });
    },
  };
}

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [react(), fixtureReport()],
  build: { outDir: '../dist/viewer', emptyOutDir: true },
});
