import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const BATCH_ROOT =
  '/Users/moiz/Documents/code/hack-raise-visual-integrity/apps/autoend/.visual-integrity/demo-runs/batch-2026-07-05T01-43-03-437Z';
const manifest = JSON.parse(await readFile(join(BATCH_ROOT, 'manifest.json'), 'utf8')) as {
  batchId: string;
  targets: Array<{
    label: string;
    url: string;
    rulePack: string;
    slug: string;
    status: string;
    violations: string[];
  }>;
};

const fail = manifest.targets.filter((t) => t.status === 'fail').length;
const pass = manifest.targets.filter((t) => t.status === 'pass').length;

const rows = manifest.targets
  .map((row) => {
    const badge =
      row.status === 'pass'
        ? '<span class="pass">PASS</span>'
        : row.status === 'fail'
          ? '<span class="fail">FAIL</span>'
          : '<span class="err">ERROR</span>';
    const link = `<a href="${row.slug}/index.html">${new URL(row.url).hostname}</a>`;
    return `<tr><td>${badge}</td><td>${row.label}</td><td>${link}</td><td>${row.rulePack}</td><td>${row.violations.join(', ') || '—'}</td></tr>`;
  })
  .join('\n');

const gallery = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><title>Visual Integrity Batch ${manifest.batchId}</title>
<style>
body{font-family:system-ui,sans-serif;margin:32px;background:#0f1117;color:#e8eaed}
h1{font-size:22px}table{width:100%;border-collapse:collapse;margin-top:16px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid #2a2f3a;font-size:14px}
.pass{color:#34a853;font-weight:700}.fail{color:#ea4335;font-weight:700}.err{color:#fbbc04;font-weight:700}
a{color:#8ab4f8}
</style></head><body>
<h1>Visual Integrity batch — ${manifest.batchId}</h1>
<p>${fail} failures · ${pass} passes</p>
<table><thead><tr><th>Status</th><th>Label</th><th>Site</th><th>Rule pack</th><th>Violations</th></tr></thead>
<tbody>${rows}</tbody></table></body></html>`;

await writeFile(join(BATCH_ROOT, 'index.html'), gallery);
console.log('Gallery regenerated');
